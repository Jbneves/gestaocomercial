// ======================================
// FIREBASE - IMPORTAÇÕES
// ======================================

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  ref,
  get,
  set,
  push,
  remove,
  update,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

import { auth, db } from "./firebase-config.js";


// ======================================
// ELEMENTOS E VARIÁVEIS
// ======================================

const $ = s => document.querySelector(s);

const content = $("#content");
const login = $("#login");
const app = $("#app");
const menu = $("#menu");
const sidebar = $("#sidebar");

let page = "dashboard";
let user = null;
let renderVersion = 0;
let authenticated = false;

// Controla o carregamento da biblioteca PDF.
let html2pdfPromise = null;


// ======================================
// CONFIGURAÇÃO DOS MÓDULOS
// ======================================

const configs = {

  clientes: {
    title: "Clientes",
    fields: [
      ["nome", "Nome"],
      ["telefone", "Telefone"],
      ["documento", "CPF/CNPJ"],
      ["email", "E-mail"],
      ["endereco", "Endereço"]
    ]
  },

  produtos: {
    title: "Estoque",
    fields: [
      ["nome", "Produto/equipamento"],
      ["codigo", "Código"],
      ["quantidade", "Quantidade", "number"],
      ["custo", "Custo unitário", "number"],
      ["preco", "Preço de venda", "number"]
    ]
  },

  vendas: {
    title: "Vendas",
    fields: [
      ["clienteNome", "Cliente"],
      ["produtoNome", "Produto"],
      ["quantidade", "Quantidade", "number"],
      ["valor", "Total", "number"],
      ["valorRecebido", "Recebido", "number"],
      ["valorPendente", "A receber", "number"]
    ]
  },

  promissorias: {
    title: "Notas promissórias",
    fields: [
      ["cliente", "Cliente"],
      ["numero", "Número da nota"],
      ["valor", "Valor", "number"],
      ["emissao", "Emissão", "date"],
      ["vencimento", "Vencimento", "date"],
      ["status", "Situação"]
    ]
  },

  ordens: {
    title: "Ordens de serviço",
    fields: [
      ["cliente", "Cliente"],
      ["equipamento", "Produto/equipamento"],
      ["defeito", "Defeito relatado"],
      ["servico", "Serviço executado"],
      ["responsavel", "Responsável"],
      ["status", "Status"],
      ["valor", "Valor", "number"]
    ]
  },

  caixa: {
    title: "Fluxo de caixa",
    fields: [
      ["tipo", "Tipo (Entrada/Saída)"],
      ["descricao", "Descrição"],
      ["categoria", "Categoria"],
      ["valor", "Valor", "number"],
      ["data", "Data", "date"]
    ]
  },

  relatorio_vendas: {
    title: "Relatório de vendas",
    fields: []
  },

  empresa: {
    title: "Dados da empresa",
    fields: []
  }

};


// ======================================
// FUNÇÕES AUXILIARES
// ======================================

async function getRows(name) {

  const snapshot = await get(ref(db, name));

  if (!snapshot.exists()) return [];

  const data = snapshot.val();

  return Object.entries(data).map(([id, value]) => ({
    id,
    ...value
  }));

}


const brl = v =>

  (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });


function esc(s) {

  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

}


function metric(t, v) {

  return `
    <div class="metric">
      <span>${esc(t)}</span>
      <strong>${esc(v)}</strong>
    </div>
  `;

}


function hoje() {

  const d = new Date();

  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;

}


function dinheiroEmCentavos(valor) {

  return Math.round((Number(valor) + Number.EPSILON) * 100);

}


// ======================================
// COMPROVANTE DE VENDA - PDF E IMPRESSÃO
// ======================================

// ======================================
// GERAÇÃO AUTOMÁTICA DE CÓDIGO DE PRODUTO
// ======================================

async function gerarCodigoProduto() {
  try {
    const produtos = await getRows("produtos");
    let maiorNumero = 0;

    produtos.forEach(p => {
      if (p.codigo) {
        const match = p.codigo.match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (num > maiorNumero) maiorNumero = num;
        }
      }
    });

    const proximo = maiorNumero + 1;
    return `PROD-${String(proximo).padStart(4, "0")}`;
  } catch (err) {
    console.error("Erro ao gerar código do produto:", err);
    return `PROD-${Date.now().toString().slice(-4)}`;
  }
}


// ======================================


async function carregarHtml2Pdf() {

  if (window.html2pdf) return;

  if (html2pdfPromise) {
    return html2pdfPromise;
  }

  html2pdfPromise = new Promise((resolve, reject) => {

    const script = document.createElement("script");

    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";

    script.onload = () => {

      if (window.html2pdf) {
        resolve();
      } else {
        reject(new Error("A biblioteca PDF não foi inicializada."));
      }

    };

    script.onerror = () => {
      reject(new Error("Não foi possível carregar a biblioteca de PDF."));
    };

    document.head.appendChild(script);

  }).catch(err => {

    html2pdfPromise = null;
    throw err;

  });

  return html2pdfPromise;

}


function formatarDataVenda(valor) {

  if (!valor) return "Não informada";

  let data;

  if (typeof valor === "number") {

    data = new Date(valor);

  } else if (typeof valor === "string") {

    data = new Date(valor);

  } else if (valor.seconds) {

    data = new Date(valor.seconds * 1000);

  }

  if (!data || Number.isNaN(data.getTime())) {
    return "Não informada";
  }

  return data.toLocaleString("pt-BR");

}


async function buscarDadosEmpresa() {

  const snapshot = await get(ref(db, "empresa"));

  return snapshot.exists() ? snapshot.val() : {};

}



function montarComprovanteHTML(venda, empresa = {}) {

  const pagamentos = Array.isArray(venda.pagamentos)
    ? venda.pagamentos
    : [];

  const pagamentosHTML = pagamentos.length
    ? pagamentos.map(p => `
        <tr>
          <td>${esc(p.metodo)}</td>
          <td class="valor">${brl(p.valor)}</td>
        </tr>
      `).join("")
    : `
        <tr>
          <td colspan="2">Forma de pagamento não informada</td>
        </tr>
      `;

  const logoHTML = empresa.logo
    ? `
        <div class="logo-area">
          <img src="${esc(empresa.logo)}" alt="Logo da empresa">
        </div>
      `
    : `
        <div class="logo-area sem-logo">
          <strong>${esc(empresa.fantasia || "EMPRESA")}</strong>
        </div>
      `;

  const dadosEmpresa = [
    empresa.razaoSocial
      ? `<p><strong>Razão social:</strong> ${esc(empresa.razaoSocial)}</p>`
      : "",

    empresa.documento
      ? `<p><strong>CPF/CNPJ:</strong> ${esc(empresa.documento)}</p>`
      : "",

    empresa.telefone
      ? `<p><strong>Telefone:</strong> ${esc(empresa.telefone)}</p>`
      : "",

    empresa.whatsapp
      ? `<p><strong>WhatsApp:</strong> ${esc(empresa.whatsapp)}</p>`
      : "",

    empresa.email
      ? `<p><strong>E-mail:</strong> ${esc(empresa.email)}</p>`
      : "",

    empresa.endereco
      ? `<p><strong>Endereço:</strong> ${esc(empresa.endereco)}</p>`
      : ""
  ].filter(Boolean);

  return `

    <div class="comprovante-venda">

      <style>

        .comprovante-venda {
          font-family: Arial, Helvetica, sans-serif;
          color: #222;
          background: #fff;
          width: 100%;
          box-sizing: border-box;
          padding: 0;
          font-size: 12px;
          line-height: 1.4;
        }

        .comprovante-venda * {
          box-sizing: border-box;
        }

        .cabecalho {
          display: flex;
          align-items: center;
          gap: 20px;
          border-bottom: 2px solid #333;
          padding: 0 0 13px;
          margin-bottom: 16px;
        }

        .logo-area {
          width: 125px;
          min-width: 125px;
          height: 90px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .logo-area img {
          max-width: 120px;
          max-height: 85px;
          object-fit: contain;
        }

        .sem-logo {
          border: 1px solid #ddd;
          text-align: center;
          padding: 8px;
        }

        .empresa-info {
          flex: 1;
          min-width: 0;
        }

        .empresa-info h1 {
          font-size: 20px;
          margin: 0 0 7px;
          color: #222;
        }

        .empresa-dados {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3px 15px;
        }

        .empresa-dados p {
          margin: 0;
          overflow-wrap: anywhere;
        }

        .titulo {
          text-align: center;
          font-size: 18px;
          font-weight: bold;
          margin: 14px 0 15px;
          padding: 9px;
          background: #f1f1f1;
          border: 1px solid #ddd;
        }

        .dados-venda {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 20px;
          border: 1px solid #ddd;
          padding: 12px;
          margin-bottom: 17px;
        }

        .dados-venda p {
          margin: 0;
        }

        h2 {
          font-size: 14px;
          margin: 17px 0 7px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }

        th, td {
          border: 1px solid #ccc;
          padding: 8px;
          text-align: left;
        }

        th {
          background: #eee;
          font-weight: bold;
        }

        .valor {
          text-align: right;
          white-space: nowrap;
        }

        .totais {
          width: 55%;
          margin-left: auto;
          border: 1px solid #ddd;
          padding: 12px;
        }

        .totais p {
          display: flex;
          justify-content: space-between;
          margin: 5px 0;
        }

        .total-geral {
          font-size: 16px;
          font-weight: bold;
          border-bottom: 1px solid #ccc;
          padding-bottom: 8px;
          margin-bottom: 8px !important;
        }

        .assinatura {
          margin-top: 48px;
          text-align: center;
        }

        .assinatura span {
          display: inline-block;
          width: 240px;
          border-top: 1px solid #333;
          padding-top: 6px;
        }

        .rodape {
          margin-top: 25px;
          padding-top: 8px;
          border-top: 1px solid #ddd;
          text-align: center;
          color: #666;
          font-size: 10px;
        }

        @media print {
          .comprovante-venda {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }

      </style>


      <div class="cabecalho">

        ${logoHTML}

        <div class="empresa-info">

          <h1>${esc(empresa.fantasia || "EMPRESA")}</h1>

          <div class="empresa-dados">

            ${dadosEmpresa.join("")}

          </div>

        </div>

      </div>


      <div class="titulo">
        COMPROVANTE DE VENDA
      </div>


      <div class="dados-venda">

        <p>
          <strong>Número da venda:</strong>
          ${esc(venda.id || "")}
        </p>

        <p>
          <strong>Data:</strong>
          ${esc(formatarDataVenda(venda.criadoEm))}
        </p>

        <p>
          <strong>Cliente:</strong>
          ${esc(venda.clienteNome || venda.cliente || "Não informado")}
        </p>

        <p>
          <strong>Status:</strong>
          ${esc(venda.status || "Não informado")}
        </p>

      </div>


      <h2>Produto vendido</h2>

      <table>

        <thead>
          <tr>
            <th>Descrição</th>
            <th>Quantidade</th>
            <th>Preço unitário</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>${esc(venda.produtoNome || "Não informado")}</td>
            <td>${esc(venda.quantidade)}</td>
            <td>${brl(venda.precoUnitario)}</td>
            <td>${brl(venda.valor)}</td>
          </tr>
        </tbody>

      </table>


      <h2>Formas de pagamento</h2>

      <table>

        <thead>
          <tr>
            <th>Forma de pagamento</th>
            <th class="valor">Valor</th>
          </tr>
        </thead>

        <tbody>
          ${pagamentosHTML}
        </tbody>

      </table>


      <div class="totais">

        <p class="total-geral">
          <span>Total da venda:</span>
          <span>${brl(venda.valor)}</span>
        </p>

        <p>
          <span>Valor recebido:</span>
          <strong>${brl(venda.valorRecebido)}</strong>
        </p>

        <p>
          <span>Valor pendente:</span>
          <strong>${brl(venda.valorPendente)}</strong>
        </p>

      </div>


      <div class="assinatura">
        <span>Assinatura do responsável</span>
      </div>


      <div class="rodape">
        ${esc(empresa.fantasia || "Comprovante de venda")}
        <br>
        Documento gerado pelo sistema de Gestão Comercial.
      </div>

    </div>

  `;
}


// ======================================
// BAIXAR PDF DA VENDA
// ======================================

// ======================================
// IMPRESSÃO DE ORDEM DE SERVIÇO (OS)
// ======================================

async function imprimirOrdemServico(ordem) {
  const janela = window.open("", "_blank");
  if (!janela) {
    alert("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
    return;
  }

  try {
    const empresa = await buscarDadosEmpresa();

    const logoHTML = empresa.logo
      ? `<div class="logo-area"><img src="${esc(empresa.logo)}" alt="Logo"></div>`
      : `<div class="logo-area sem-logo"><strong>${esc(empresa.fantasia || "EMPRESA")}</strong></div>`;

    const htmlOS = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Ordem de Serviço #${esc(ordem.id || "")}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #222; margin: 0; padding: 20px; font-size: 13px; line-height: 1.4; }
          .cabecalho { display: flex; align-items: center; gap: 20px; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 15px; }
          .logo-area { width: 120px; min-width: 120px; height: 80px; display: flex; align-items: center; justify-content: center; }
          .logo-area img { max-width: 110px; max-height: 75px; object-fit: contain; }
          .sem-logo { border: 1px solid #ddd; text-align: center; padding: 5px; }
          .empresa-info { flex: 1; }
          .empresa-info h1 { font-size: 18px; margin: 0 0 5px; }
          .titulo { text-align: center; font-size: 16px; font-weight: bold; margin: 15px 0; padding: 8px; background: #f1f1f1; border: 1px solid #ddd; }
          .secao-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border: 1px solid #ddd; padding: 10px; margin-bottom: 15px; }
          .secao-grid p { margin: 4px 0; }
          .bloco { margin-bottom: 15px; border: 1px solid #ddd; padding: 10px; }
          .bloco h3 { margin: 0 0 8px 0; font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          .totais { width: 40%; margin-left: auto; border: 1px solid #ddd; padding: 10px; font-weight: bold; text-align: right; }
          .assinatura { margin-top: 50px; text-align: center; }
          .assinatura span { display: inline-block; width: 250px; border-top: 1px solid #333; padding-top: 5px; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="cabecalho">
          ${logoHTML}
          <div class="empresa-info">
            <h1>${esc(empresa.fantasia || "EMPRESA")}</h1>
            <p>${esc(empresa.documento || "")} | ${esc(empresa.telefone || "")}</p>
            <p>${esc(empresa.endereco || "")}</p>
          </div>
        </div>

        <div class="titulo">ORDEM DE SERVIÇO Nº ${esc(ordem.id || "")}</div>

        <div class="secao-grid">
          <p><strong>Cliente:</strong> ${esc(ordem.cliente || "Não informado")}</p>
          <p><strong>Status:</strong> ${esc(ordem.status || "Pendente")}</p>
          <p><strong>Responsável:</strong> ${esc(ordem.responsavel || "Não informado")}</p>
          <p><strong>Data:</strong> ${esc(ordem.data || hoje())}</p>
        </div>

        <div class="bloco">
          <h3>Equipamento / Produto</h3>
          <p>${esc(ordem.equipamento || "Não informado")}</p>
        </div>

        <div class="bloco">
          <h3>Defeito Relatado</h3>
          <p>${esc(ordem.defeito || "Não informado")}</p>
        </div>

        <div class="bloco">
          <h3>Serviço Executado</h3>
          <p>${esc(ordem.servico || "Aguardando execução")}</p>
        </div>

        <div class="totais">
          Valor Total: ${brl(ordem.valor)}
        </div>

        <div class="assinatura">
          <span>Assinatura do Cliente / Responsável</span>
        </div>
      </body>
      </html>
    `;

    janela.onload = () => {
      janela.focus();
      janela.print();
    };

    janela.document.open();
    janela.document.write(htmlOS);
    janela.document.close();

  } catch (err) {
    console.error("Erro ao imprimir OS:", err);
    janela.close();
    alert("Erro ao preparar impressão da OS: " + err.message);
  }
}




async function baixarPDFVenda(venda) {

  let elemento = null;

  try {

    const empresa = await buscarDadosEmpresa();

    await carregarHtml2Pdf();

    elemento = document.createElement("div");

    elemento.innerHTML = montarComprovanteHTML(
      venda,
      empresa
    );


    // O elemento fica temporariamente na tela
    // para que o html2canvas consiga capturá-lo.

    elemento.style.width = "190mm";
    elemento.style.position = "fixed";
    elemento.style.left = "0";
    elemento.style.top = "0";
    elemento.style.zIndex = "99999";
    elemento.style.background = "#ffffff";
    elemento.style.pointerEvents = "none";


    document.body.appendChild(elemento);


    // Aguarda a logo terminar de carregar, se existir.

    const imagens = [
      ...elemento.querySelectorAll("img")
    ];

    await Promise.all(imagens.map(img => {

      if (img.complete) {
        return Promise.resolve();
      }

      return new Promise(resolve => {

        img.onload = resolve;
        img.onerror = resolve;

      });

    }));


    const nomeArquivo =
      `comprovante-venda-${venda.id || "venda"}.pdf`;


    await window.html2pdf()

      .set({

        margin: 10,

        filename: nomeArquivo,

        image: {
          type: "jpeg",
          quality: 0.98
        },

        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false
        },

        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait"
        },

        pagebreak: {
          mode: ["avoid-all", "css", "legacy"]
        }

      })

      .from(elemento.firstElementChild)

      .save();


  } catch (err) {

    console.error("Erro ao gerar PDF:", err);

    alert("Erro ao gerar PDF: " + err.message);

  } finally {

    if (elemento) {
      elemento.remove();
    }

  }

}


// ======================================
// IMPRIMIR VENDA
// ======================================

async function imprimirVenda(venda) {

  // Abrir a janela imediatamente para evitar
  // bloqueio do navegador por pop-up.

  const janela = window.open("", "_blank");

  if (!janela) {

    alert(
      "O navegador bloqueou a janela de impressão. " +
      "Permita pop-ups para este site."
    );

    return;

  }


  try {

    const empresa = await buscarDadosEmpresa();

    const comprovante = montarComprovanteHTML(
      venda,
      empresa
    );


    // Registrar o evento antes de fechar o documento.

    janela.onload = () => {

      janela.focus();

      janela.print();

    };


    janela.document.open();

    janela.document.write(`

      <!DOCTYPE html>

      <html lang="pt-BR">

        <head>

          <meta charset="UTF-8">

          <title>Comprovante de venda</title>

          <style>

            @page {
              size:A4;
              margin:12mm;
            }

            body {
              margin:0;
              padding:0;
              background:white;
            }

            @media print {

              body {
                -webkit-print-color-adjust:exact;
                print-color-adjust:exact;
              }

            }

          </style>

        </head>

        <body>

          ${comprovante}

        </body>

      </html>

    `);

    janela.document.close();


  } catch (err) {

    console.error("Erro ao imprimir:", err);

    janela.close();

    alert("Erro ao preparar impressão: " + err.message);

  }

}


// ======================================
// CADASTRO DOS DADOS DA EMPRESA
// ======================================

// ======================================
// RELATÓRIO DE VENDAS POR PERÍODO
// ======================================

async function renderRelatorioVendas(currentRender) {
  if (
    currentRender !== renderVersion ||
    !authenticated ||
    page !== "relatorio_vendas"
  ) return;

  const hojeStr = hoje();
  const dataInicioPadrao = new Date();
  dataInicioPadrao.setDate(dataInicioPadrao.getDate() - 30);
  const inicioStr = dataInicioPadrao.toISOString().split("T")[0];

  content.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Relatório de Vendas por Período</h2>
        <span class="muted">Consulte o faturamento, quantidade de vendas e formas de pagamento recebidas.</span>
      </div>
    </div>

    <div class="panel" style="margin-bottom: 20px;">
      <form id="filtroRelatorio" style="display: flex; gap: 15px; align-items: flex-end; flex-wrap: wrap;">
        <label>
          Data Inicial
          <input type="date" id="dataInicio" value="${inicioStr}" required style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </label>
        <label>
          Data Final
          <input type="date" id="dataFim" value="${hojeStr}" required style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </label>
        <button type="submit" style="padding: 9px 16px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
          <i class="fa-solid fa-filter"></i> Filtrar Relatório
        </button>
      </form>
    </div>

    <div id="resultadoRelatorio">
      <!-- Conteúdo gerado dinamicamente -->
    </div>
  `;

  const formFiltro = $("#filtroRelatorio");
  const divResultado = $("#resultadoRelatorio");

  async function carregarRelatorio(dataIni, dataFim) {
    divResultado.innerHTML = `<p class="muted">Carregando dados...</p>`;

    try {
      const vendas = await getRows("vendas");

      const vendasFiltradas = vendas.filter(v => {
        if (!v.criadoEm) return false;
        let dataVendaStr = "";
        if (typeof v.criadoEm === "number" || typeof v.criadoEm === "string") {
          dataVendaStr = new Date(v.criadoEm).toISOString().split("T")[0];
        } else if (v.criadoEm.seconds) {
          dataVendaStr = new Date(v.criadoEm.seconds * 1000).toISOString().split("T")[0];
        }
        return dataVendaStr >= dataIni && dataVendaStr <= dataFim;
      });

      let totalFaturado = 0;
      let totalRecebido = 0;
      let totalPendente = 0;
      const formasPagamentoMap = {};

      vendasFiltradas.forEach(v => {
        totalFaturado += Number(v.valor) || 0;
        totalRecebido += Number(v.valorRecebido) || 0;
        totalPendente += Number(v.valorPendente) || 0;

        if (Array.isArray(v.pagamentos)) {
          v.pagamentos.forEach(p => {
            const metodo = p.metodo || "Outros";
            const val = Number(p.valor) || 0;
            formasPagamentoMap[metodo] = (formasPagamentoMap[metodo] || 0) + val;
          });
        }
      });

      const pagamentosHTML = Object.entries(formasPagamentoMap).length > 0
        ? Object.entries(formasPagamentoMap).map(([metodo, valor]) => `
            <tr>
              <td>${esc(metodo)}</td>
              <td class="valor">${brl(valor)}</td>
            </tr>
          `).join("")
        : `<tr><td colspan="2">Nenhum pagamento registrado no período.</td></tr>`;

      const listaVendasHTML = vendasFiltradas.length > 0
        ? vendasFiltradas.map(v => `
            <tr>
              <td>${esc(v.id)}</td>
              <td>${esc(formatarDataVenda(v.criadoEm))}</td>
              <td>${esc(v.clienteNome || v.cliente || "Cliente não informado")}</td>
              <td class="valor">${brl(v.valor)}</td>
            </tr>
          `).join("")
        : `<tr><td colspan="4" style="text-align: center;">Nenhuma venda encontrada no período selecionado.</td></tr>`;

      divResultado.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
          <div class="panel" style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 15px;">
            <span class="muted">Total de Vendas</span>
            <h3 style="margin: 5px 0 0; font-size: 20px;">${vendasFiltradas.length}</h3>
          </div>
          <div class="panel" style="background: #f8fafc; border-left: 4px solid #16a34a; padding: 15px;">
            <span class="muted">Valor Faturado</span>
            <h3 style="margin: 5px 0 0; font-size: 20px; color: #16a34a;">${brl(totalFaturado)}</h3>
          </div>
          <div class="panel" style="background: #f8fafc; border-left: 4px solid #0284c7; padding: 15px;">
            <span class="muted">Valor Recebido</span>
            <h3 style="margin: 5px 0 0; font-size: 20px;">${brl(totalRecebido)}</h3>
          </div>
          <div class="panel" style="background: #f8fafc; border-left: 4px solid #dc2626; padding: 15px;">
            <span class="muted">Valor Pendente</span>
            <h3 style="margin: 5px 0 0; font-size: 20px; color: #dc2626;">${brl(totalPendente)}</h3>
          </div>
        </div>

        <div class="panel" style="margin-bottom: 25px;">
          <h3>Formas de Pagamento no Período</h3>
          <table>
            <thead>
              <tr>
                <th>Método de Pagamento</th>
                <th class="valor">Total Arrecadado</th>
              </tr>
            </thead>
            <tbody>
              ${pagamentosHTML}
            </tbody>
          </table>
        </div>

        <div class="panel">
          <h3>Detalhamento das Vendas</h3>
          <table>
            <thead>
              <tr>
                <th>ID / Venda</th>
                <th>Data</th>
                <th>Cliente</th>
                <th class="valor">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              ${listaVendasHTML}
            </tbody>
          </table>
        </div>
      `;

    } catch (err) {
      console.error("Erro ao gerar relatório:", err);
      divResultado.innerHTML = `<p style="color: red;">Erro ao carregar relatório: ${err.message}</p>`;
    }
  }

  formFiltro.addEventListener("submit", e => {
    e.preventDefault();
    const ini = $("#dataInicio").value;
    const fim = $("#dataFim").value;
    carregarRelatorio(ini, fim);
  });

  carregarRelatorio(inicioStr, hojeStr);
}



async function renderEmpresa(currentRender) {

  const snapshot = await get(ref(db, "empresa"));

  if (
    currentRender !== renderVersion ||
    !authenticated ||
    page !== "empresa"
  ) return;


  const empresa = snapshot.exists()
    ? snapshot.val()
    : {};


  content.innerHTML = `

    <div class="toolbar">

      <div>

        <h2>Dados da empresa</h2>

        <span class="muted">
          Informações que poderão aparecer nos comprovantes de venda.
        </span>

      </div>

    </div>


    <div class="panel">

      <form id="empresaForm" class="form-grid">

        <label>
          Nome fantasia

          <input
            name="fantasia"
            value="${esc(empresa.fantasia || "")}"
            placeholder="Nome comercial da empresa"
            required
          >

        </label>


        <label>
          Razão social

          <input
            name="razaoSocial"
            value="${esc(empresa.razaoSocial || "")}"
            placeholder="Razão social"
          >

        </label>


        <label>
          CPF/CNPJ

          <input
            name="documento"
            value="${esc(empresa.documento || "")}"
            placeholder="CPF ou CNPJ"
          >

        </label>


        <label>
          Telefone

          <input
            name="telefone"
            value="${esc(empresa.telefone || "")}"
            placeholder="Telefone"
          >

        </label>


        <label>
          WhatsApp

          <input
            name="whatsapp"
            value="${esc(empresa.whatsapp || "")}"
            placeholder="WhatsApp"
          >

        </label>


        <label>
          E-mail

          <input
            name="email"
            type="email"
            value="${esc(empresa.email || "")}"
            placeholder="E-mail comercial"
          >

        </label>


        <label style="grid-column:1/-1">

          Endereço completo

          <input
            name="endereco"
            value="${esc(empresa.endereco || "")}"
            placeholder="Rua, número, bairro, cidade e CEP"
          >

        </label>


        <div style="grid-column:1/-1">

          <h3>Logo da empresa</h3>

          <p class="muted">
            Escolha uma imagem PNG ou JPG. O sistema reduzirá
            automaticamente o tamanho antes de salvar.
          </p>


          <input
            type="file"
            id="empresaLogo"
            accept="image/png,image/jpeg"
          >


          <div style="margin-top:15px">

            <img
              id="empresaLogoPreview"
              src="${esc(empresa.logo || "")}"
              alt="Logo da empresa"
              style="
                ${empresa.logo ? "" : "display:none;"}
                max-width:220px;
                max-height:120px;
                object-fit:contain;
                border:1px solid #ddd;
                padding:10px;
                border-radius:8px;
              "
            >

          </div>

        </div>


        <button type="submit">

          <i class="fa-solid fa-floppy-disk"></i>
          Salvar dados da empresa

        </button>

      </form>

    </div>

  `;


  const form = $("#empresaForm");
  const logoInput = $("#empresaLogo");
  const preview = $("#empresaLogoPreview");

  let logoAtual = empresa.logo || "";


  // ==================================
  // PRÉ-VISUALIZAÇÃO E REDUÇÃO DA LOGO
  // ==================================

  logoInput.addEventListener("change", async () => {

    const arquivo = logoInput.files[0];

    if (!arquivo) return;


    if (!["image/png", "image/jpeg"].includes(arquivo.type)) {

      alert("Selecione uma imagem PNG ou JPG.");

      logoInput.value = "";

      return;

    }


    let url = null;

    try {

      const imagem = new Image();

      url = URL.createObjectURL(arquivo);

      await new Promise((resolve, reject) => {

        imagem.onload = resolve;
        imagem.onerror = reject;

        imagem.src = url;

      });


      const limite = 500;

      const escala = Math.min(
        1,
        limite / Math.max(imagem.width, imagem.height)
      );


      const canvas = document.createElement("canvas");

      canvas.width = Math.max(
        1,
        Math.round(imagem.width * escala)
      );

      canvas.height = Math.max(
        1,
        Math.round(imagem.height * escala)
      );


      const contexto = canvas.getContext("2d");

      contexto.fillStyle = "#ffffff";

      contexto.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );


      contexto.drawImage(
        imagem,
        0,
        0,
        canvas.width,
        canvas.height
      );


      const logoReduzida = canvas.toDataURL(
        "image/jpeg",
        0.75
      );


      const tamanhoBytes = Math.ceil(
        (logoReduzida.length - "data:image/jpeg;base64,".length) * 3 / 4
      );


      if (tamanhoBytes > 300 * 1024) {

        throw new Error(
          "A logo ainda ficou muito grande. Escolha uma imagem menor."
        );

      }


      logoAtual = logoReduzida;

      preview.src = logoAtual;

      preview.style.display = "block";


    } catch (err) {

      console.error("Erro ao processar logo:", err);

      alert("Erro ao processar a logo: " + err.message);

      logoInput.value = "";

    } finally {

      if (url) {
        URL.revokeObjectURL(url);
      }

    }

  });


  // ==================================
  // SALVAR DADOS DA EMPRESA
  // ==================================

  form.addEventListener("submit", async e => {

    e.preventDefault();

    const button = form.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = "Salvando...";

    try {

      const fd = new FormData(form);

      const dados = Object.fromEntries(fd.entries());


      await set(ref(db, "empresa"), {

        fantasia: dados.fantasia.trim(),

        razaoSocial: dados.razaoSocial.trim(),

        documento: dados.documento.trim(),

        telefone: dados.telefone.trim(),

        whatsapp: dados.whatsapp.trim(),

        email: dados.email.trim(),

        endereco: dados.endereco.trim(),

        logo: logoAtual,

        atualizadoPor: user.uid,

        atualizadoEm: serverTimestamp()

      });


      alert("Dados da empresa salvos com sucesso!");

      await render();


    } catch (err) {

      console.error("Erro ao salvar empresa:", err);

      alert("Erro ao salvar os dados: " + err.message);

      button.disabled = false;

      button.innerHTML =
        '<i class="fa-solid fa-floppy-disk"></i> Salvar dados da empresa';

    }

  });

}


// ======================================
// MOVIMENTAÇÃO DE ESTOQUE
// ======================================

function configurarEstoque(produtos) {

  const form = $("#movementForm");

  if (!form) return;

  const productSelect = $("#movementProduct");
  const typeSelect = $("#movementType");
  const quantityInput = $("#movementQuantity");
  const reasonInput = $("#movementReason");


  content.querySelectorAll("[data-stock-move]").forEach(button => {

    button.addEventListener("click", () => {

      productSelect.value = button.dataset.stockMove;

      form.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      quantityInput.focus();

    });

  });


  form.addEventListener("submit", async e => {

    e.preventDefault();

    const button = form.querySelector('button[type="submit"]');

    const produtoId = productSelect.value;
    const tipo = typeSelect.value;
    const quantidade = Number(quantityInput.value);
    const motivo = reasonInput.value.trim();


    if (!produtoId) {
      alert("Selecione um produto.");
      return;
    }

    if (!["Entrada", "Baixa"].includes(tipo)) {
      alert("Selecione uma operação válida.");
      return;
    }

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      alert("Informe uma quantidade válida.");
      return;
    }

    if (!motivo) {
      alert("Informe o motivo da movimentação.");
      return;
    }


    const produto = produtos.find(p => p.id === produtoId);

    if (!produto) {
      alert("Produto não encontrado.");
      return;
    }


    if (!confirm(
      `${tipo} de ${quantidade} unidade(s) do produto ${produto.nome}?\n\n` +
      `Estoque atual: ${produto.quantidade}`
    )) return;


    button.disabled = true;
    button.textContent = "Processando...";


    let quantidadeRef = null;
    let movimentacaoRealizada = false;

    try {

      const produtoRef = ref(
        db,
        `produtos/${produtoId}`
      );

      const produtoSnapshot = await get(produtoRef);

      if (!produtoSnapshot.exists()) {
        throw new Error("O produto não foi encontrado no Firebase.");
      }

      const produtoAtual = produtoSnapshot.val();


      const estoqueInicial = Number(
        produtoAtual.quantidade ?? 0
      );

      if (
        !Number.isFinite(estoqueInicial) ||
        estoqueInicial < 0
      ) {
        throw new Error("O estoque atual do produto é inválido.");
      }


      quantidadeRef = ref(
        db,
        `produtos/${produtoId}/quantidade`
      );


      const resultado = await runTransaction(

        quantidadeRef,

        atual => {

          const estoqueAtual = atual === null
            ? estoqueInicial
            : Number(atual);


          if (
            !Number.isFinite(estoqueAtual) ||
            estoqueAtual < 0
          ) {
            return;
          }


          if (
            tipo === "Baixa" &&
            estoqueAtual < quantidade
          ) {
            return;
          }


          const novoSaldo = tipo === "Entrada"
            ? estoqueAtual + quantidade
            : estoqueAtual - quantidade;


          return Math.round(novoSaldo * 100) / 100;

        }

      );


      if (!resultado.committed) {

        const estoqueAtual = resultado.snapshot.val();

        const saldoVerificado = estoqueAtual === null
          ? estoqueInicial
          : Number(estoqueAtual);


        if (
          tipo === "Baixa" &&
          saldoVerificado < quantidade
        ) {

          throw new Error(
            `Estoque insuficiente. Saldo atual: ${saldoVerificado}.`
          );

        }


        throw new Error(
          "Não foi possível atualizar o estoque."
        );

      }


      movimentacaoRealizada = true;


      const saldoNovo = Number(
        resultado.snapshot.val()
      );

      const saldoAnterior = tipo === "Entrada"
        ? saldoNovo - quantidade
        : saldoNovo + quantidade;


      const historicoRef = push(
        ref(db, "movimentacoes_estoque")
      );


      await set(historicoRef, {

        produtoId,

        produtoNome: produtoAtual.nome || produto.nome,

        tipo,

        quantidade,

        saldoAnterior,

        saldoNovo,

        motivo,

        data: hoje(),

        usuario: user.email || user.uid,

        criadoPor: user.uid,

        criadoEm: serverTimestamp()

      });


      alert(
        "Movimentação registrada com sucesso!\n\n" +
        `Produto: ${produto.nome}\n` +
        `Operação: ${tipo}\n` +
        `Quantidade: ${quantidade}\n` +
        `Saldo anterior: ${saldoAnterior}\n` +
        `Saldo atual: ${saldoNovo}`
      );


      await render();


    } catch (err) {

      console.error("Erro na movimentação:", err);


      if (movimentacaoRealizada && quantidadeRef) {

        try {

          const rollback = await runTransaction(

            quantidadeRef,

            atual => {

              const estoqueAtual = atual === null
                ? Number(produto.quantidade ?? 0)
                : Number(atual);


              if (!Number.isFinite(estoqueAtual)) {
                return;
              }


              const saldoRestaurado = tipo === "Entrada"
                ? estoqueAtual - quantidade
                : estoqueAtual + quantidade;


              if (saldoRestaurado < 0) {
                return;
              }


              return Math.round(
                saldoRestaurado * 100
              ) / 100;

            }

          );


          if (!rollback.committed) {

            throw new Error(
              "A transação de restauração não foi concluída."
            );

          }

        } catch (rollbackError) {

          console.error(
            "Erro ao restaurar estoque:",
            rollbackError
          );

          alert(
            "ATENÇÃO: a movimentação alterou o estoque, mas ocorreu " +
            "um erro ao salvar o histórico e não foi possível restaurar " +
            "automaticamente o saldo. Confira o estoque do produto."
          );

        }

      }


      alert("Erro na movimentação: " + err.message);


    } finally {

      if (button.isConnected) {

        button.disabled = false;

        button.innerHTML =
          '<i class="fa-solid fa-arrows-rotate"></i> Registrar movimentação';

      }

    }

  });

}


// ======================================
// NAVEGAÇÃO
// ======================================

function setPage(newPage) {

  if (!authenticated) return;

  if (newPage !== "dashboard" && !configs[newPage]) return;

  page = newPage;

  menu.querySelectorAll("button[data-page]").forEach(button => {

    button.classList.toggle(
      "selected",
      button.dataset.page === page
    );

  });

  sidebar.classList.remove("open");

  window.scrollTo({
    top: 0,
    behavior: "auto"
  });

  render();

}


menu.addEventListener("click", e => {

  const button = e.target.closest("button[data-page]");

  if (!button) return;

  setPage(button.dataset.page);

});


$("#menuToggle").addEventListener("click", () => {

  sidebar.classList.toggle("open");

});


document.addEventListener("click", e => {

  if (
    window.innerWidth <= 850 &&
    sidebar.classList.contains("open") &&
    !sidebar.contains(e.target) &&
    !$("#menuToggle").contains(e.target)
  ) {

    sidebar.classList.remove("open");

  }

});


// ======================================
// LOGIN
// ======================================

$("#loginForm").addEventListener("submit", async e => {

  e.preventDefault();

  const form = e.currentTarget;
  const button = form.querySelector('button[type="submit"]');

  const email = $("#email").value.trim();
  const password = $("#password").value;

  $("#loginError").textContent = "";

  button.disabled = true;
  button.textContent = "Entrando...";

  try {

    await signInWithEmailAndPassword(auth, email, password);

  } catch (err) {

    console.error("Erro no login:", err);

    $("#loginError").textContent =
      "Falha no acesso. Confira e-mail e senha.";

    button.disabled = false;

    button.innerHTML =
      '<i class="fa-solid fa-right-to-bracket"></i> Entrar no sistema';

  }

});


// ======================================
// LOGOUT
// ======================================

$("#logout").addEventListener("click", async () => {

  if (!confirm("Deseja realmente sair do sistema?")) return;

  try {

    await signOut(auth);

  } catch (err) {

    console.error("Erro ao sair:", err);

    alert("Erro ao sair: " + err.message);

  }

});


// ======================================
// AUTENTICAÇÃO FIREBASE
// ======================================

onAuthStateChanged(auth, async u => {

  user = u;
  authenticated = !!u;

  renderVersion++;

  login.hidden = !!u;
  app.hidden = !u;

  if (u) {

    $("#userEmail").textContent = u.email || "";

    page = "dashboard";

    menu.querySelectorAll("button[data-page]").forEach(button => {

      button.classList.toggle(
        "selected",
        button.dataset.page === "dashboard"
      );

    });

    sidebar.classList.remove("open");

    await render();

  } else {

    content.innerHTML = "";

    page = "dashboard";

    $("#loginError").textContent = "";
    $("#password").value = "";

    const button = $("#loginForm").querySelector(
      'button[type="submit"]'
    );

    button.disabled = false;

    button.innerHTML =
      '<i class="fa-solid fa-right-to-bracket"></i> Entrar no sistema';

  }

});


// ======================================
// RESUMO DO CAIXA
// ======================================

async function renderDashboard(currentRender) {

  const [
    clientes,
    produtos,
    vendas,
    ordens,
    caixa,
    promissorias
  ] = await Promise.all([

    getRows("clientes"),
    getRows("produtos"),
    getRows("vendas"),
    getRows("ordens"),
    getRows("caixa"),
    getRows("promissorias")

  ]);


  if (
    currentRender !== renderVersion ||
    !authenticated ||
    page !== "dashboard"
  ) return;


  const entradas = caixa

    .filter(x =>
      String(x.tipo).toLowerCase().startsWith("ent")
    )

    .reduce((a, x) =>
      a + (Number(x.valor) || 0), 0);


  const saidas = caixa

    .filter(x =>
      String(x.tipo).toLowerCase().startsWith("sa")
    )

    .reduce((a, x) =>
      a + (Number(x.valor) || 0), 0);


  const aReceber = promissorias

    .filter(x =>
      !["paga", "pago", "quitada", "quitado"].includes(
        String(x.status).toLowerCase()
      )
    )

    .reduce((a, x) =>
      a + (Number(x.valor) || 0), 0);


  content.innerHTML = `

    <div class="toolbar">
      <div>
        <h2>Visão geral</h2>
        <span class="muted">Resumo dos registros</span>
      </div>
    </div>

    <div class="grid">

      ${metric("Clientes", clientes.length)}

      ${metric("Produtos", produtos.length)}

      ${metric("Vendas", vendas.length)}

      ${metric("Ordens de serviço", ordens.length)}

      ${metric("Entradas de caixa", brl(entradas))}

      ${metric("Saídas de caixa", brl(saidas))}

      ${metric("Saldo de caixa", brl(entradas - saidas))}

      ${metric("Promissórias a receber", brl(aReceber))}

    </div>

    <div class="panel note">
      <i class="fa-solid fa-circle-check"></i>
      Sistema conectado ao Firebase Realtime Database.
    </div>

  `;

}


// ======================================
// FORMULÁRIO DE PAGAMENTO
// ======================================

function paymentRow() {

  return `

    <div class="payment-row form-grid"
         style="margin-bottom:12px; padding:12px; border:1px solid #ddd; border-radius:8px;">

      <label>
        Forma de pagamento

        <select class="payment-method" required>

          <option value="Dinheiro">Dinheiro</option>
          <option value="Pix">Pix</option>
          <option value="Cartão de débito">Cartão de débito</option>
          <option value="Cartão de crédito">Cartão de crédito</option>
          <option value="Promissória">Promissória</option>

        </select>
      </label>

      <label>
        Valor

        <input
          class="payment-value"
          type="number"
          min="0.01"
          step="0.01"
          required
          placeholder="0,00"
        >
      </label>

      <button type="button" class="danger remove-payment">
        <i class="fa-solid fa-trash"></i>
        Remover
      </button>

    </div>

  `;

}


// ======================================
// TELA ESPECIAL DE VENDAS
// ======================================

function configurarVenda(data, produtos, clientes, currentRender) {

  const form = $("#recordForm");

  const productSelect = form.querySelector('[name="produtoId"]');
  const customerSelect = form.querySelector('[name="clienteId"]');
  const quantityInput = form.querySelector('[name="quantidade"]');
  const priceInput = form.querySelector('[name="precoUnitario"]');
  const totalInput = form.querySelector('[name="valor"]');

  const paymentsContainer = $("#paymentsContainer");
  const addPaymentButton = $("#addPayment");
  const paymentSummary = $("#paymentSummary");
  const dueDateWrap = $("#dueDateWrap");
  const dueDateInput = $("#dueDate");

  let paymentIndex = 0;


  function atualizarPagamentos() {

    const rows = [
      ...paymentsContainer.querySelectorAll(".payment-row")
    ];

    let totalPagamentos = 0;
    let totalRecebido = 0;
    let totalPromissoria = 0;

    let temPromissoria = false;


    rows.forEach(row => {

      const metodo = row.querySelector(".payment-method").value;

      const valor = Number(
        row.querySelector(".payment-value").value
      ) || 0;

      totalPagamentos += valor;

      if (metodo === "Promissória") {

        totalPromissoria += valor;
        temPromissoria = true;

      } else {

        totalRecebido += valor;

      }

    });


    dueDateWrap.hidden = !temPromissoria;
    dueDateInput.required = temPromissoria;

    const totalVenda = Number(totalInput.value) || 0;

    const diferenca = totalVenda - totalPagamentos;


    paymentSummary.innerHTML = `

      <p>Total da venda: <strong>${brl(totalVenda)}</strong></p>

      <p>Pagamentos informados: <strong>${brl(totalPagamentos)}</strong></p>

      <p>Recebido agora: <strong>${brl(totalRecebido)}</strong></p>

      <p>A receber: <strong>${brl(totalPromissoria)}</strong></p>

      <p>
        Diferença:
        <strong>${brl(diferenca)}</strong>
      </p>

    `;

  }


  function atualizarTotal() {

    const produto = produtos.find(
      p => p.id === productSelect.value
    );

    const quantidade = Number(quantityInput.value) || 0;

    const preco = produto
      ? Number(produto.preco) || 0
      : 0;

    priceInput.value = preco.toFixed(2);

    totalInput.value = (
      Math.round(preco * quantidade * 100) / 100
    ).toFixed(2);


    const rows = paymentsContainer.querySelectorAll(".payment-row");

    if (rows.length === 1) {

      rows[0].querySelector(".payment-value").value =
        totalInput.value;

    }

    atualizarPagamentos();

  }


  function adicionarPagamento() {

    paymentIndex++;

    paymentsContainer.insertAdjacentHTML(
      "beforeend",
      paymentRow()
    );

    atualizarPagamentos();

  }


  paymentsContainer.addEventListener("input", atualizarPagamentos);

  paymentsContainer.addEventListener("change", atualizarPagamentos);


  paymentsContainer.addEventListener("click", e => {

    const button = e.target.closest(".remove-payment");

    if (!button) return;

    const rows = paymentsContainer.querySelectorAll(".payment-row");

    if (rows.length <= 1) {

      alert("A venda precisa ter pelo menos uma forma de pagamento.");
      return;

    }

    button.closest(".payment-row").remove();

    atualizarPagamentos();

  });


  addPaymentButton.addEventListener("click", adicionarPagamento);


  productSelect.addEventListener("change", atualizarTotal);

  quantityInput.addEventListener("input", atualizarTotal);


  adicionarPagamento();


  // ==================================
  // SALVAR VENDA
  // ==================================

  form.addEventListener("submit", async e => {

    e.preventDefault();

    const button = form.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = "Registrando venda...";

    let stockRef = null;
    let quantidade = 0;

    try {

      if (!customerSelect.value) {
        throw new Error("Selecione um cliente.");
      }

      if (!productSelect.value) {
        throw new Error("Selecione um produto.");
      }


      const cliente = clientes.find(
        c => c.id === customerSelect.value
      );

      if (!cliente) {
        throw new Error("Cliente não encontrado.");
      }


      const produtoRef = ref(
        db,
        `produtos/${productSelect.value}`
      );

      const produtoSnapshot = await get(produtoRef);

      if (!produtoSnapshot.exists()) {
        throw new Error("Produto não encontrado.");
      }

      const produto = produtoSnapshot.val();


      quantidade = Number(quantityInput.value);

      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        throw new Error("Informe uma quantidade válida.");
      }


      const precoUnitario = Number(produto.preco);

      if (!Number.isFinite(precoUnitario) || precoUnitario < 0) {
        throw new Error("Preço do produto inválido.");
      }


      const totalVenda = Math.round(
        precoUnitario * quantidade * 100
      ) / 100;

      if (totalVenda <= 0) {
        throw new Error("O total da venda precisa ser maior que zero.");
      }


      const pagamentos = [
        ...paymentsContainer.querySelectorAll(".payment-row")
      ].map(row => ({

        metodo: row.querySelector(".payment-method").value,

        valor: Number(
          row.querySelector(".payment-value").value
        )

      }));


      if (!pagamentos.length) {
        throw new Error("Informe pelo menos uma forma de pagamento.");
      }


      if (pagamentos.some(p =>
        !Number.isFinite(p.valor) || p.valor <= 0
      )) {
        throw new Error("Todos os pagamentos precisam ter valores maiores que zero.");
      }


      const somaPagamentosCentavos = pagamentos.reduce(
        (total, p) => total + dinheiroEmCentavos(p.valor),
        0
      );

      const totalVendaCentavos = dinheiroEmCentavos(totalVenda);


      if (somaPagamentosCentavos !== totalVendaCentavos) {

        throw new Error(
          `A soma dos pagamentos (${brl(somaPagamentosCentavos / 100)}) ` +
          `precisa ser igual ao total da venda (${brl(totalVenda)}).`
        );

      }


      const valorRecebido = pagamentos

        .filter(p => p.metodo !== "Promissória")

        .reduce((total, p) => total + p.valor, 0);


      const valorPendente = pagamentos

        .filter(p => p.metodo === "Promissória")

        .reduce((total, p) => total + p.valor, 0);


      const vencimento = dueDateInput.value;

      if (valorPendente > 0 && !vencimento) {
        throw new Error("Informe o vencimento da promissória.");
      }


      // BAIXAR ESTOQUE COM TRANSAÇÃO

      stockRef = ref(
        db,
        `produtos/${productSelect.value}/quantidade`
      );


      const transactionResult = await runTransaction(

        stockRef,

        current => {

          const available = current === null
            ? Number(produto.quantidade)
            : Number(current);


          if (
            !Number.isFinite(available) ||
            available < quantidade
          ) {
            return;
          }

          return available - quantidade;

        }

      );


      if (!transactionResult.committed) {

        const currentStock = (
          await get(stockRef)
        ).val();

        throw new Error(
          `Estoque insuficiente para ${produto.nome}. ` +
          `Estoque atual: ${currentStock}.`
        );

      }


      // PREPARAR GRAVAÇÃO DA VENDA

      const vendaRef = push(ref(db, "vendas"));

      const vendaId = vendaRef.key;

      const statusVenda = valorPendente > 0
        ? (valorRecebido > 0 ? "Parcial" : "Pendente")
        : "Paga";


      const venda = {

        clienteId: cliente.id,
        clienteNome: cliente.nome,

        produtoId: productSelect.value,
        produtoNome: produto.nome,

        quantidade,
        precoUnitario,
        valor: totalVenda,

        valorRecebido,
        valorPendente,

        pagamentos,

        status: statusVenda,

        criadoPor: user.uid,
        criadoEm: serverTimestamp()

      };


      // GRAVAÇÃO CONJUNTA: VENDA + CAIXA + PROMISSÓRIA

      const atualizacoes = {};

      atualizacoes[`vendas/${vendaId}`] = venda;


      pagamentos

        .filter(p => p.metodo !== "Promissória")

        .forEach(p => {

          const caixaRef = push(ref(db, "caixa"));

          atualizacoes[`caixa/${caixaRef.key}`] = {

            tipo: "Entrada",

            descricao:
              `Venda ${produto.nome} - ${cliente.nome} (${p.metodo})`,

            categoria: "Venda",

            valor: p.valor,

            data: hoje(),

            forma: p.metodo,

            vendaId,

            criadoPor: user.uid,
            criadoEm: serverTimestamp()

          };

        });


      if (valorPendente > 0) {

        const promissoriaRef = push(
          ref(db, "promissorias")
        );

        atualizacoes[`promissorias/${promissoriaRef.key}`] = {

          cliente: cliente.nome,

          clienteId: cliente.id,

          numero: `VENDA-${vendaId.slice(-6).toUpperCase()}`,

          valor: valorPendente,

          emissao: hoje(),

          vencimento,

          status: "Pendente",

          vendaId,

          criadoPor: user.uid,
          criadoEm: serverTimestamp()

        };

      }


      try {

        await update(ref(db), atualizacoes);

      } catch (err) {

        // Devolver estoque se a gravação da venda falhar.

        await runTransaction(

          stockRef,

          current => {

            if (current === null || current === undefined) {
              return;
            }

            return Number(current) + quantidade;

          }

        );

        throw err;

      }


      alert(
        "Venda registrada com sucesso!\n\n" +
        `Total: ${brl(totalVenda)}\n` +
        `Recebido: ${brl(valorRecebido)}\n` +
        `A receber: ${brl(valorPendente)}`
      );


      await render();


    } catch (err) {

      console.error("Erro ao registrar venda:", err);

      alert("Erro ao registrar venda: " + err.message);

    } finally {

      if (button.isConnected) {

        button.disabled = false;

        button.innerHTML =
          '<i class="fa-solid fa-floppy-disk"></i> Registrar venda';

      }

    }

  });


  // ==================================
  // BAIXAR PDF DAS VENDAS
  // ==================================

  content.querySelectorAll("[data-sale-pdf]").forEach(button => {

    button.addEventListener("click", async () => {

      const venda = data.find(
        v => v.id === button.dataset.salePdf
      );

      if (!venda) {
        alert("Venda não encontrada.");
        return;
      }


      button.disabled = true;

      const textoOriginal = button.innerHTML;

      button.textContent = "Gerando PDF...";


      try {

        await baixarPDFVenda(venda);

      } finally {

        if (button.isConnected) {

          button.disabled = false;

          button.innerHTML = textoOriginal;

        }

      }

    });

  });


  // ==================================
  // IMPRIMIR VENDAS
  // ==================================

  content.querySelectorAll("[data-sale-print]").forEach(button => {

    button.addEventListener("click", async () => {

      const venda = data.find(
        v => v.id === button.dataset.salePrint
      );

      if (!venda) {
        alert("Venda não encontrada.");
        return;
      }

      await imprimirVenda(venda);

    });

  });


  // ==================================
  // EXCLUIR VENDA
  // ==================================

  content.querySelectorAll("[data-delete]").forEach(button => {

    button.addEventListener("click", async () => {

      if (!confirm(
        "Deseja realmente excluir esta venda? O estoque não será devolvido automaticamente."
      )) return;


      try {

        button.disabled = true;

        await remove(
          ref(db, `vendas/${button.dataset.delete}`)
        );


        alert(
          "Venda excluída. Atenção: os lançamentos de caixa e promissórias relacionados não foram removidos."
        );


        await render();


      } catch (err) {

        console.error(err);

        alert("Erro ao excluir: " + err.message);

        button.disabled = false;

      }

    });

  });

}


// ======================================
// RENDERIZAR PÁGINAS
// ======================================

async function render() {

  if (!authenticated || !user) return;

  const currentRender = ++renderVersion;
  const currentPage = page;


  try {

    // DASHBOARD

    if (currentPage === "dashboard") {

      await renderDashboard(currentRender);

      return;

    }


    // OUTROS MÓDULOS

    const cfg = configs[currentPage];

    if (!cfg) return;


    // ==================================
    // TELA DE DADOS DA EMPRESA
    // ==================================

    if (currentPage === "relatorio_vendas") {
      await renderRelatorioVendas(currentRender);
      return;
    }

    if (currentPage === "empresa") {

      await renderEmpresa(currentRender);

      return;

    }


    const data = await getRows(currentPage);

    const codigoSugerido = currentPage === "produtos" ? await gerarCodigoProduto() : "";

    let produtos = [];
    let clientes = [];
    let movimentacoes = [];


    // CARREGAR PRODUTOS E HISTÓRICO DE ESTOQUE

    if (currentPage === "produtos") {

      produtos = data;

      movimentacoes = await getRows("movimentacoes_estoque");

    }


    // CARREGAR DADOS DAS VENDAS

    if (currentPage === "vendas") {

      [produtos, clientes] = await Promise.all([

        getRows("produtos"),
        getRows("clientes")

      ]);

    }


    if (
      currentRender !== renderVersion ||
      !authenticated ||
      currentPage !== page
    ) return;


    // CONSTRUIR FORMULÁRIOS

    const fields = cfg.fields.map(([k, l, t]) => {

      if (currentPage === "vendas") {

        if (k === "clienteNome") {

          return `

            <label>
              Cliente

              <select name="clienteId" required>

                <option value="">Selecione um cliente</option>

                ${clientes.map(c => `

                  <option value="${esc(c.id)}">
                    ${esc(c.nome)}
                  </option>

                `).join("")}

              </select>

            </label>

          `;

        }


        if (k === "produtoNome") {

          return `

            <label>
              Produto

              <select name="produtoId" required>

                <option value="">Selecione um produto</option>

                ${produtos.map(p => `

                  <option
                    value="${esc(p.id)}"
                    ${Number(p.quantidade) <= 0 ? "disabled" : ""}
                  >

                    ${esc(p.nome)}
                    - Estoque: ${esc(p.quantidade)}
                    - ${brl(p.preco)}

                  </option>

                `).join("")}

              </select>

            </label>

          `;

        }


        if (k === "quantidade") {

          return `

            <label>
              Quantidade

              <input
                name="quantidade"
                type="number"
                min="0.01"
                step="0.01"
                value="1"
                required
              >

            </label>

          `;

        }


        if (k === "valor") {

          return `

            <label>
              Preço total da venda

              <input
                name="valor"
                type="number"
                step="0.01"
                readonly
                required
              >

            </label>

            <label>
              Preço unitário

              <input
                name="precoUnitario"
                type="number"
                step="0.01"
                readonly
              >

            </label>

          `;

        }


        return "";

      }


      if (currentPage === "produtos" && k === "codigo") {
        return `
          <label>
            ${esc(l)} (automático)
            <input name="codigo" type="text" value="${esc(codigoSugerido)}" placeholder="Gerado automaticamente">
          </label>
        `;
      }

      return `

        <label>

          ${esc(l)}

          <input
            name="${esc(k)}"
            type="${t || "text"}"
            ${t === "number" ? 'step="0.01" min="0"' : ""}
            required
          >

        </label>

      `;

    }).join("");


    // TABELA PRINCIPAL

    const tabela = data.map(r => `

      <tr>

        ${cfg.fields.map(([k]) => {

          let valor = r[k];

          if (currentPage === "vendas") {

            if (k === "clienteNome") {
              valor = r.clienteNome || r.cliente || "";
            }

            if (k === "produtoNome") {
              valor = r.produtoNome || r.produtoId || "";
            }

          }

          return `

            <td>

              ${
                ["valor", "custo", "preco", "valorRecebido", "valorPendente"].includes(k)
                  ? brl(valor)
                  : esc(valor)
              }

            </td>

          `;

        }).join("")}


        <td>

          <div class="actions">

            ${
              currentPage === "vendas"
                ? `

                  <button
                    type="button"
                    data-sale-pdf="${esc(r.id)}"
                  >
                    <i class="fa-solid fa-file-pdf"></i>
                    Baixar PDF
                  </button>


                  <button
                    type="button"
                    data-sale-print="${esc(r.id)}"
                  >
                    <i class="fa-solid fa-print"></i>
                    Imprimir
                  </button>

                `
                : ""
            }


            ${
              currentPage === "ordens"
                ? `

                  <button
                    type="button"
                    data-os-print="${esc(r.id)}"
                  >
                    <i class="fa-solid fa-print"></i>
                    Imprimir OS
                  </button>

                `
                : ""
            }


            ${
              currentPage === "produtos"
                ? `

                  <button
                    type="button"
                    data-stock-move="${esc(r.id)}"
                  >
                    <i class="fa-solid fa-arrows-rotate"></i>
                    Movimentar
                  </button>

                `
                : ""
            }


            <button
              class="danger"
              data-delete="${esc(r.id)}"
              type="button"
            >

              <i class="fa-solid fa-trash"></i>
              Excluir

            </button>

          </div>

        </td>

      </tr>

    `).join("");


    // TELA

    content.innerHTML = `

      <div class="toolbar">

        <div>

          <h2>${esc(cfg.title)}</h2>

          <span class="muted">
            ${data.length} registro(s)
          </span>

        </div>

      </div>


      <div class="panel">

        <h3>${currentPage === "vendas" ? "Nova venda" : "Novo registro"}</h3>

        <form id="recordForm" class="form-grid">

          ${fields}

          ${
            currentPage === "vendas"
              ? `

                <div style="grid-column:1/-1">

                  <h3>Formas de pagamento</h3>

                  <div id="paymentsContainer"></div>

                  <button type="button" id="addPayment">
                    <i class="fa-solid fa-plus"></i>
                    Adicionar forma de pagamento
                  </button>

                  <div id="paymentSummary" class="panel note" style="margin-top:15px"></div>

                  <div id="dueDateWrap" hidden style="margin-top:15px">

                    <label>
                      Vencimento da promissória

                      <input
                        type="date"
                        id="dueDate"
                      >

                    </label>

                  </div>

                </div>

              `
              : ""
          }


          <button type="submit">

            <i class="fa-solid fa-floppy-disk"></i>

            ${currentPage === "vendas" ? "Registrar venda" : "Salvar"}

          </button>

        </form>

      </div>


      ${
        currentPage === "produtos"
          ? `

            <div class="panel">

              <h3>Movimentar estoque</h3>

              <p class="muted">
                Registre entradas e baixas de produtos já cadastrados.
              </p>

              <form id="movementForm" class="form-grid">

                <label>
                  Produto

                  <select id="movementProduct" required>

                    <option value="">Selecione um produto</option>

                    ${produtos.map(p => `

                      <option value="${esc(p.id)}">

                        ${esc(p.nome)}
                        - Estoque atual: ${esc(p.quantidade)}

                      </option>

                    `).join("")}

                  </select>

                </label>


                <label>
                  Operação

                  <select id="movementType" required>

                    <option value="Entrada">Entrada de estoque</option>
                    <option value="Baixa">Baixa de estoque</option>

                  </select>

                </label>


                <label>
                  Quantidade

                  <input
                    id="movementQuantity"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Informe a quantidade"
                    required
                  >

                </label>


                <label>
                  Motivo da movimentação

                  <input
                    id="movementReason"
                    type="text"
                    placeholder="Ex.: Compra, reposição, perda, uso..."
                    required
                  >

                </label>


                <button type="submit">

                  <i class="fa-solid fa-arrows-rotate"></i>
                  Registrar movimentação

                </button>

              </form>

            </div>


            <div class="panel">

              <h3>Histórico de movimentações</h3>

              <div class="table-wrap">

                <table>

                  <thead>

                    <tr>
                      <th>Data</th>
                      <th>Produto</th>
                      <th>Operação</th>
                      <th>Quantidade</th>
                      <th>Saldo anterior</th>
                      <th>Saldo atual</th>
                      <th>Motivo</th>
                      <th>Usuário</th>
                    </tr>

                  </thead>

                  <tbody>

                    ${
                      [...movimentacoes]
                        .reverse()
                        .map(m => `

                          <tr>

                            <td>${esc(m.data)}</td>

                            <td>${esc(m.produtoNome)}</td>

                            <td>${esc(m.tipo)}</td>

                            <td>${esc(m.quantidade)}</td>

                            <td>${esc(m.saldoAnterior)}</td>

                            <td>${esc(m.saldoNovo)}</td>

                            <td>${esc(m.motivo)}</td>

                            <td>${esc(m.usuario)}</td>

                          </tr>

                        `).join("")
                      || `

                        <tr>
                          <td class="empty" colspan="8">
                            Nenhuma movimentação registrada.
                          </td>
                        </tr>

                      `
                    }

                  </tbody>

                </table>

              </div>

            </div>

          `
          : ""
      }


      <div class="table-wrap">

        <table>

          <thead>

            <tr>

              ${cfg.fields.map(x => `
                <th>${esc(x[1])}</th>
              `).join("")}

              <th>Ações</th>

            </tr>

          </thead>


          <tbody>

            ${tabela || `

              <tr>

                <td class="empty" colspan="${cfg.fields.length + 1}">
                  Nenhum registro cadastrado.
                </td>

              </tr>

            `}

          </tbody>

        </table>

      </div>

    `;


    // ESTOQUE

    if (currentPage === "produtos") {

      configurarEstoque(produtos);

    }


    // VENDAS

    if (currentPage === "vendas") {

      configurarVenda(data, produtos, clientes, currentRender);

      return;

    }


    // SALVAR OUTROS REGISTROS

    $("#recordForm").addEventListener("submit", async e => {

      e.preventDefault();

      const form = e.currentTarget;

      const button = form.querySelector('button[type="submit"]');

      button.disabled = true;
      button.textContent = "Salvando...";


      try {

        const fd = new FormData(form);

        const record = Object.fromEntries(fd.entries());


        for (const [k, , t] of cfg.fields) {

          if (t === "number") {

            record[k] = Number(record[k]);

            if (
              !Number.isFinite(record[k]) ||
              record[k] < 0
            ) {

              throw new Error(
                `Valor inválido no campo ${k}.`
              );

            }

          }

        }


        if (currentPage === "produtos" && !String(record.codigo || "").trim()) {
          record.codigo = await gerarCodigoProduto();
        }

        if (currentPage === "ordens" && !record.data) {
          record.data = hoje();
        }

        record.criadoPor = user.uid;
        record.criadoEm = serverTimestamp();


        const novoRegistro = push(
          ref(db, currentPage)
        );

        await set(novoRegistro, record);


        alert("Registro salvo com sucesso!");

        await render();


      } catch (err) {

        console.error("Erro ao salvar:", err);

        alert("Erro ao salvar: " + err.message);

        button.disabled = false;

        button.innerHTML =
          '<i class="fa-solid fa-floppy-disk"></i> Salvar';

      }

    });


    // IMPRIMIR ORDEM DE SERVIÇO

    content.querySelectorAll("[data-os-print]").forEach(button => {
      button.addEventListener("click", () => {
        const ordem = data.find(o => o.id === button.dataset.osPrint);
        if (ordem) imprimirOrdemServico(ordem);
      });
    });


    // EXCLUIR OUTROS REGISTROS

    content.querySelectorAll("[data-delete]").forEach(button => {

      button.addEventListener("click", async () => {

        if (!confirm("Deseja realmente excluir este registro?")) {
          return;
        }


        try {

          button.disabled = true;
          button.textContent = "Excluindo...";

          await remove(
            ref(db, `${currentPage}/${button.dataset.delete}`)
          );


          alert("Registro excluído!");

          await render();


        } catch (err) {

          console.error("Erro ao excluir:", err);

          alert("Erro ao excluir: " + err.message);

          button.disabled = false;

          button.innerHTML =
            '<i class="fa-solid fa-trash"></i> Excluir';

        }

      });

    });


  } catch (err) {

    if (currentRender !== renderVersion) return;

    console.error("Erro ao carregar página:", err);


    content.innerHTML = `

      <div class="panel">

        <h2>Não foi possível carregar</h2>

        <p>${esc(err.message)}</p>

        <p>
          Confira a configuração do Firebase
          e as regras do Realtime Database.
        </p>

        <button id="retryPage" type="button">

          <i class="fa-solid fa-rotate"></i>
          Tentar novamente

        </button>

      </div>

    `;


    $("#retryPage").addEventListener("click", () => {
      render();
    });

  }

}
