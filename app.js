```javascript
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

// O Firebase já é inicializado em firebase-config.js
import { auth, db } from "./firebase-config.js";

// ======================================
// ELEMENTOS E VARIÁVEIS
// ======================================

const $ = s => document.querySelector(s);
const content = $("#content");

let page = "dashboard";
let user = null;

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
// LOGIN
// ======================================

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  $("#loginError").textContent = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      $("#email").value.trim(),
      $("#password").value
    );
  } catch (err) {
    console.error("Erro no login:", err);

    $("#loginError").textContent =
      "Falha no acesso. Confira e-mail e senha.";
  }
});

// ======================================
// LOGOUT
// ======================================

$("#logout").onclick = async () => {
  try {
    await signOut(auth);
  } catch (err) {
    alert("Erro ao sair: " + err.message);
  }
};

// ======================================
// AUTENTICAÇÃO
// ======================================

onAuthStateChanged(auth, async u => {
  user = u;

  $("#login").hidden = !!u;
  $("#app").hidden = !u;

  if (u) {
    $("#userEmail").textContent = u.email || "";
    await render();
  }
});

// ======================================
// MENU
// ======================================

$("#menu").addEventListener("click", e => {
  const b = e.target.closest("button[data-page]");

  if (!b) return;

  page = b.dataset.page;

  document.querySelectorAll("#menu button").forEach(x => {
    x.classList.toggle("selected", x === b);
  });

  render();
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
// FORMATAÇÃO
// ======================================

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

// ======================================
// PAINEL E MÓDULOS
// ======================================

async function render() {
  try {

    // ==================================
    // PAINEL PRINCIPAL
    // ==================================

    if (page === "dashboard") {

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

      const entradas = caixa
        .filter(x =>
          String(x.tipo).toLowerCase().startsWith("ent")
        )
        .reduce((a, x) => a + (Number(x.valor) || 0), 0);

      const saidas = caixa
        .filter(x =>
          String(x.tipo).toLowerCase().startsWith("sa")
        )
        .reduce((a, x) => a + (Number(x.valor) || 0), 0);

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
        </div>

        <div class="panel note">
          Sistema conectado ao Firebase Realtime Database.
        </div>
      `;

      return;
    }

    // ==================================
    // CONFIGURAÇÃO DA PÁGINA
    // ==================================

    const cfg = configs[page];

    if (!cfg) return;

    const data = await getRows(page);

    let produtos = [];

    if (page === "vendas") {
      produtos = await getRows("produtos");
    }

    // ==================================
    // FORMULÁRIO
    // ==================================

    const fields = cfg.fields.map(([k, l, t]) => {

      if (page === "vendas" && k === "produtoId") {

        return `
          <label>
            ${l}

            <select name="produtoId" required>
              <option value="">Selecione um produto</option>

              ${produtos.map(p => `
                <option value="${esc(p.id)}">
                  ${esc(p.nome)} - Estoque: ${esc(p.quantidade)}
                </option>
              `).join("")}
            </select>
          </label>
        `;
      }

      return `
        <label>
          ${l}

          <input
            name="${k}"
            type="${t || "text"}"
            ${t === "number" ? 'step="0.01" min="0"' : ""}
            required
          >
        </label>
      `;

    }).join("");

    // ==================================
    // TABELA DE REGISTROS
    // ==================================

    content.innerHTML = `
      <div class="toolbar">
        <div>
          <h2>${cfg.title}</h2>
          <span class="muted">${data.length} registro(s)</span>
        </div>
      </div>

      <div class="panel">
        <h3>Novo registro</h3>

        <form id="recordForm" class="form-grid">
          ${fields}
          <button type="submit">Salvar</button>
        </form>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${cfg.fields.map(x => `<th>${x[1]}</th>`).join("")}
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
                    >
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
      const button = form.querySelector('button[type="submit"]');

      button.disabled = true;
      button.textContent = "Salvando...";

      try {

        const fd = new FormData(form);
        const record = Object.fromEntries(fd.entries());

        // CONVERTER CAMPOS NUMÉRICOS

        for (const [k, , t] of cfg.fields) {

          if (t === "number") {

            record[k] = Number(record[k]);

            if (
              !Number.isFinite(record[k]) ||
              record[k] < 0
            ) {
              throw new Error(`Valor inválido no campo ${k}.`);
            }
          }
        }

        record.criadoPor = user.uid;
        record.criadoEm = serverTimestamp();

        // ==================================
        // CADASTRAR PRODUTO
        // ==================================

        if (page === "produtos") {

          const novoProduto = push(ref(db, "produtos"));

          await set(novoProduto, record);

        }

        // ==================================
        // REALIZAR VENDA E BAIXAR ESTOQUE
        // ==================================

        else if (page === "vendas") {

          const produtoId = record.produtoId;
          const quantidade = record.quantidade;

          if (!produtoId) {
            throw new Error("Selecione um produto.");
          }

          if (quantidade <= 0) {
            throw new Error("Informe uma quantidade válida.");
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
            throw new Error("Produto não encontrado.");
          }

          const produto = produtoSnapshot.val();

          // GERAR ID DA VENDA

          const novaVenda = push(ref(db, "vendas"));

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
              `Estoque insuficiente para ${produto.nome}. Estoque atual: ${currentStock}.`
            );
          }

          // GRAVAR VENDA

          try {

            await set(novaVenda, {
              ...record,
              produtoNome: produto.nome
            });

          } catch (err) {

            // TENTAR DEVOLVER ESTOQUE SE A VENDA FALHAR

            await runTransaction(stockRef, current => {

              if (
                current === null ||
                current === undefined
              ) {
                return;
              }

              return Number(current) + quantidade;

            });

            throw err;
          }

        }

        // ==================================
        // OUTROS CADASTROS
        // ==================================

        else {

          const novoRegistro = push(ref(db, page));

          await set(novoRegistro, record);

        }

        alert("Registro salvo com sucesso!");

        await render();

      } catch (err) {

        console.error("Erro ao salvar:", err);

        alert("Erro ao salvar: " + err.message);

        button.disabled = false;
        button.textContent = "Salvar";

      }

    });

    // ==================================
    // EXCLUIR REGISTROS
    // ==================================

    content.querySelectorAll("[data-delete]").forEach(b => {

      b.onclick = async () => {

        if (!confirm("Deseja realmente excluir este registro?")) {
          return;
        }

        try {

          // AVISO SOBRE EXCLUSÃO DE VENDA

          if (page === "vendas") {

            const confirmar = confirm(
              "Atenção: excluir esta venda não devolverá o estoque. Deseja continuar?"
            );

            if (!confirmar) return;
          }

          await remove(
            ref(db, `${page}/${b.dataset.delete}`)
          );

          alert("Registro excluído!");

          await render();

        } catch (err) {

          console.error("Erro ao excluir:", err);

          alert("Erro ao excluir: " + err.message);

        }

      };

    });

  } catch (err) {

    console.error("Erro ao carregar página:", err);

    content.innerHTML = `
      <div class="panel">
        <h2>Não foi possível carregar</h2>
        <p>${esc(err.message)}</p>
        <p>
          Confira a configuração do Firebase e as regras do Realtime Database.
        </p>
      </div>
    `;

  }
}

// ======================================
// MÉTRICAS DO PAINEL
// ======================================

function metric(t, v) {

  return `
    <div class="metric">
      <span>${t}</span>
      <strong>${v}</strong>
    </div>
  `;

}
```
