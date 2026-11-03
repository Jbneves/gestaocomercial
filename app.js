
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

// Controle das renderizações simultâneas
let renderVersion = 0;

// Evita operações durante a troca de autenticação
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
      ["quantidade", "Quantidade inicial", "number"],
      ["custo", "Custo unitário", "number"],
      ["preco", "Preço de venda", "number"]
    ]
  },

  vendas: {
    title: "Vendas",
    fields: [
      ["cliente", "Cliente"],
      ["produtoId", "Produto"],
      ["quantidade", "Quantidade vendida", "number"],
      ["valor", "Valor total", "number"],
      ["forma", "Forma de pagamento"],
      ["status", "Status"]
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
// NAVEGAÇÃO
// ======================================

function setPage(newPage) {

  if (!authenticated) return;

  if (newPage !== "dashboard" && !configs[newPage]) {
    return;
  }

  page = newPage;

  // Atualizar botão selecionado
  menu.querySelectorAll("button[data-page]").forEach(button => {

    button.classList.toggle(
      "selected",
      button.dataset.page === page
    );

  });

  // Fechar menu no celular
  sidebar.classList.remove("open");

  // Voltar ao topo
  window.scrollTo({
    top: 0,
    behavior: "instant"
  });

  // Carregar página
  render();

}


// ======================================
// MENU LATERAL
// ======================================

menu.addEventListener("click", e => {

  const button = e.target.closest("button[data-page]");

  if (!button) return;

  setPage(button.dataset.page);

});


// ======================================
// BOTÃO ABRIR / FECHAR MENU
// ======================================

$("#menuToggle").addEventListener("click", () => {

  sidebar.classList.toggle("open");

});


// ======================================
// FECHAR MENU AO CLICAR FORA
// ======================================

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

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

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

  if (!confirm("Deseja realmente sair do sistema?")) {
    return;
  }

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

  // Invalidar renderizações anteriores
  renderVersion++;

  login.hidden = !!u;
  app.hidden = !u;

  if (u) {

    $("#userEmail").textContent = u.email || "";

    // Iniciar sempre no painel
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
// BUSCAR DADOS DO REALTIME DATABASE
// ======================================

async function getRows(name) {

  const snapshot = await get(ref(db, name));

  if (!snapshot.exists()) {
    return [];
  }

  const data = snapshot.val();

  return Object.entries(data).map(([id, value]) => ({

    id,
    ...value

  }));

}


// ======================================
// FORMATAÇÃO DE MOEDA
// ======================================

const brl = v =>

  (Number(v) || 0).toLocaleString("pt-BR", {

    style: "currency",
    currency: "BRL"

  });


// ======================================
// PROTEÇÃO CONTRA HTML
// ======================================

function esc(s) {

  return String(s ?? "").replace(/[&<>"']/g, c => ({

    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"

  }[c]));

}


// ======================================
// MÉTRICAS DO PAINEL
// ======================================

function metric(t, v) {

  return `

    <div class="metric">

      <span>${esc(t)}</span>

      <strong>${esc(v)}</strong>

    </div>

  `;

}


// ======================================
// RENDERIZAR PÁGINAS
// ======================================

async function render() {

  if (!authenticated || !user) return;

  // Identificador desta renderização
  const currentRender = ++renderVersion;

  // Página solicitada nesta execução
  const currentPage = page;

  try {

    // ==================================
    // PAINEL PRINCIPAL
    // ==================================

    if (currentPage === "dashboard") {

      const [
        clientes,
        produtos,
        vendas,
        ordens,
        caixa
      ] = await Promise.all([

        getRows("clientes"),
        getRows("produtos"),
        getRows("vendas"),
        getRows("ordens"),
        getRows("caixa")

      ]);

      // Verificar se o usuário ainda está na mesma página
      if (
        currentRender !== renderVersion ||
        !authenticated ||
        currentPage !== page
      ) {
        return;
      }

      const entradas = caixa

        .filter(x =>
          String(x.tipo).toLowerCase().startsWith("ent")
        )

        .reduce((a, x) =>
          a + (Number(x.valor) || 0), 0
        );


      const saidas = caixa

        .filter(x =>
          String(x.tipo).toLowerCase().startsWith("sa")
        )

        .reduce((a, x) =>
          a + (Number(x.valor) || 0), 0
        );


      content.innerHTML = `

        <div class="toolbar">

          <div>

            <h2>Visão geral</h2>

            <span class="muted">
              Resumo dos registros
            </span>

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

        </div>


        <div class="panel note">

          <i class="fa-solid fa-circle-check"></i>

          Sistema conectado ao Firebase Realtime Database.

        </div>

      `;

      return;

    }


    // ==================================
    // OUTROS MÓDULOS
    // ==================================

    const cfg = configs[currentPage];

    if (!cfg) return;

    const data = await getRows(currentPage);

    let produtos = [];


    if (currentPage === "vendas") {

      produtos = await getRows("produtos");

    }


    // Verificar se a página ainda é a mesma
    if (
      currentRender !== renderVersion ||
      !authenticated ||
      currentPage !== page
    ) {
      return;
    }


    // ==================================
    // CONSTRUIR FORMULÁRIOS
    // ==================================

    const fields = cfg.fields.map(([k, l, t]) => {

      // Seleção de produtos nas vendas
      if (
        currentPage === "vendas" &&
        k === "produtoId"
      ) {

        return `

          <label>

            ${esc(l)}

            <select name="produtoId" required>

              <option value="">
                Selecione um produto
              </option>

              ${produtos.map(p => `

                <option value="${esc(p.id)}">

                  ${esc(p.nome)}
                  - Estoque: ${esc(p.quantidade)}

                </option>

              `).join("")}

            </select>

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


    // ==================================
    // CONSTRUIR TABELA
    // ==================================

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

        <h3>Novo registro</h3>

        <form id="recordForm" class="form-grid">

          ${fields}

          <button type="submit">
            <i class="fa-solid fa-floppy-disk"></i>
            Salvar
          </button>

        </form>

      </div>


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

            ${data.map(r => `

              <tr>

                ${cfg.fields.map(([k]) => `

                  <td>

                    ${

                      ["valor", "custo", "preco"].includes(k)

                        ? brl(r[k])

                        : esc(

                            k === "produtoId"

                              ? (r.produtoNome || r.produtoId)

                              : r[k]

                          )

                    }

                  </td>

                `).join("")}


                <td>

                  <div class="actions">

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

            `).join("") || `

              <tr>

                <td

                  class="empty"

                  colspan="${cfg.fields.length + 1}"

                >

                  Nenhum registro cadastrado.

                </td>

              </tr>

            `}

          </tbody>

        </table>

      </div>

    `;


    // ==================================
    // SALVAR REGISTROS
    // ==================================

    $("#recordForm").addEventListener("submit", async e => {

      e.preventDefault();

      const form = e.currentTarget;

      const button = form.querySelector(
        'button[type="submit"]'
      );

      button.disabled = true;

      button.textContent = "Salvando...";


      try {

        const fd = new FormData(form);

        const record = Object.fromEntries(fd.entries());


        // ==================================
        // CONVERTER CAMPOS NUMÉRICOS
        // ==================================

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


        // ==================================
        // CADASTRAR PRODUTO
        // ==================================

        if (currentPage === "produtos") {

          const novoProduto = push(
            ref(db, "produtos")
          );

          await set(novoProduto, record);

        }


        // ==================================
        // REALIZAR VENDA
        // E BAIXAR ESTOQUE
        // ==================================

        else if (currentPage === "vendas") {

          const produtoId = record.produtoId;

          const quantidade = record.quantidade;


          if (!produtoId) {

            throw new Error(
              "Selecione um produto."
            );

          }


          if (quantidade <= 0) {

            throw new Error(
              "Informe uma quantidade válida."
            );

          }


          const produtoRef = ref(
            db,
            `produtos/${produtoId}`
          );


          const stockRef = ref(
            db,
            `produtos/${produtoId}/quantidade`
          );


          // BUSCAR PRODUTO

          const produtoSnapshot = await get(produtoRef);


          if (!produtoSnapshot.exists()) {

            throw new Error(
              "Produto não encontrado."
            );

          }


          const produto = produtoSnapshot.val();

          console.log("DIAGNÓSTICO DA VENDA:", {
  produtoId,
  produtoNome: produto.nome,
  quantidadeSolicitada: quantidade,
  estoqueLido: produto.quantidade,
  tipoEstoque: typeof produto.quantidade
});


          // GERAR ID DA VENDA

          const novaVenda = push(
            ref(db, "vendas")
          );


          // BAIXAR ESTOQUE COM TRANSAÇÃO

          const transactionResult = await runTransaction(

            stockRef,

            current => {

              if (
                current === null ||
                current === undefined
              ) {

                return;

              }


              const available = Number(current);

              console.log("VERIFICAÇÃO DO ESTOQUE:", {
  current,
  available,
  quantidade,
  comparacao: available < quantidade,
  tipoCurrent: typeof current,
  tipoQuantidade: typeof quantidade
});


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


          // GRAVAR VENDA

          try {

            await set(novaVenda, {

              ...record,

              produtoNome: produto.nome

            });

          } catch (err) {

            // DEVOLVER ESTOQUE SE A GRAVAÇÃO FALHAR

            await runTransaction(

              stockRef,

              current => {

                if (
                  current === null ||
                  current === undefined
                ) {

                  return;

                }

                return Number(current) + quantidade;

              }

            );

            throw err;

          }

        }


        // ==================================
        // OUTROS CADASTROS
        // ==================================

        else {

          const novoRegistro = push(
            ref(db, currentPage)
          );

          await set(novoRegistro, record);

        }


        alert("Registro salvo com sucesso!");


        // Atualizar a tela atual
        if (authenticated) {

          await render();

        }


      } catch (err) {

        console.error("Erro ao salvar:", err);

        alert("Erro ao salvar: " + err.message);

        button.disabled = false;

        button.innerHTML =

          '<i class="fa-solid fa-floppy-disk"></i> Salvar';

      }

    });


    // ==================================
    // EXCLUIR REGISTROS
    // ==================================

    content.querySelectorAll("[data-delete]").forEach(button => {

      button.addEventListener("click", async () => {

        if (
          !confirm(
            "Deseja realmente excluir este registro?"
          )
        ) {

          return;

        }


        try {

          // AVISO SOBRE EXCLUSÃO DE VENDA

          if (currentPage === "vendas") {

            const confirmar = confirm(

              "Atenção: excluir esta venda não devolverá o estoque. " +
              "Deseja continuar?"

            );

            if (!confirmar) return;

          }


          button.disabled = true;

          button.textContent = "Excluindo...";


          await remove(

            ref(
              db,
              `${currentPage}/${button.dataset.delete}`
            )

          );


          alert("Registro excluído!");


          if (authenticated) {

            await render();

          }


        } catch (err) {

          console.error("Erro ao excluir:", err);

          alert(
            "Erro ao excluir: " + err.message
          );

          button.disabled = false;

          button.innerHTML =
            '<i class="fa-solid fa-trash"></i> Excluir';

        }

      });

    });


  } catch (err) {

    // Não mostrar erros de páginas que já foram abandonadas
    if (currentRender !== renderVersion) {
      return;
    }

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
