
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
// MOVIMENTAÇÃO DE ESTOQUE
// ======================================

function configurarEstoque(produtos) {

  const form = $("#movementForm");

  if (!form) return;

  const productSelect = $("#movementProduct");
  const typeSelect = $("#movementType");
  const quantityInput = $("#movementQuantity");
  const reasonInput = $("#movementReason");

  // Selecionar produto pelo botão da tabela.

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


  // Registrar entrada ou baixa.

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

    const produtoRef = ref(db, `produtos/${produtoId}`);

    let movimentacaoRealizada = false;

    try {

      // Atualizar estoque usando transação.

      const resultado = await runTransaction(
        produtoRef,
        atual => {

          if (!atual) return;

          const estoqueAtual = Number(atual.quantidade ?? 0);

          if (
            !Number.isFinite(estoqueAtual) ||
            estoqueAtual < 0
          ) {
            return;
          }

          if (tipo === "Baixa" && estoqueAtual < quantidade) {
            return;
          }

          const novoSaldo = tipo === "Entrada"
            ? estoqueAtual + quantidade
            : estoqueAtual - quantidade;

          return {
            ...atual,
            quantidade: Math.round(novoSaldo * 100) / 100
          };

        }
      );


      if (!resultado.committed) {

        const atual = resultado.snapshot.val();

        if (!atual) {
          throw new Error("O produto não foi encontrado no estoque.");
        }

        const estoqueAtual = Number(atual.quantidade ?? 0);

        if (tipo === "Baixa" && estoqueAtual < quantidade) {

          throw new Error(
            `Estoque insuficiente. Saldo atual: ${estoqueAtual}.`
          );

        }

        throw new Error("Não foi possível atualizar o estoque.");

      }


      movimentacaoRealizada = true;

      const produtoAtualizado = resultado.snapshot.val();

      const saldoNovo = Number(produtoAtualizado.quantidade);

      const saldoAnterior = tipo === "Entrada"
        ? saldoNovo - quantidade
        : saldoNovo + quantidade;


      // Criar registro no histórico.

      const historicoRef = push(
        ref(db, "movimentacoes_estoque")
      );

      await set(historicoRef, {

        produtoId,

        produtoNome: produtoAtualizado.nome || produto.nome,

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

      // Se o estoque foi alterado, mas o histórico não foi
      // salvo, tentar restaurar o saldo anterior.

      if (movimentacaoRealizada) {

        try {

          await runTransaction(produtoRef, atual => {

            if (!atual) return;

            const estoqueAtual = Number(atual.quantidade ?? 0);

            const saldoRestaurado = tipo === "Entrada"
              ? estoqueAtual - quantidade
              : estoqueAtual + quantidade;

            if (saldoRestaurado < 0) return;

            return {
              ...atual,
              quantidade: Math.round(saldoRestaurado * 100) / 100
            };

          });

        } catch (rollbackError) {

          console.error(
            "Erro ao restaurar estoque:",
            rollbackError
          );

          alert(
            "Atenção: não foi possível restaurar automaticamente " +
            "o estoque. Confira o saldo do produto."
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


  // EXCLUIR VENDA

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

    const data = await getRows(currentPage);

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


    // ==================================
    // ESTOQUE
    // ==================================

    if (currentPage === "produtos") {

      configurarEstoque(produtos);

    }


    // ==================================
    // VENDAS
    // ==================================

    if (currentPage === "vendas") {

      configurarVenda(data, produtos, clientes, currentRender);

      return;

    }


    // ==================================
    // SALVAR OUTROS REGISTROS
    // ==================================

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


    // ==================================
    // EXCLUIR OUTROS REGISTROS
    // ==================================

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
