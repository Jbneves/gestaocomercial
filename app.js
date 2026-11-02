
import {
  ref,
  push,
  get,
  remove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

import {
  auth,
  db
} from "./firebase-config.js";

const $ = s => document.querySelector(s);
const content = $("#content");

let page = "dashboard";
let user = null;

const configs = {
  clientes: {
    title: "Clientes",
    fields: [
      ["nome","Nome"],
      ["telefone","Telefone"],
      ["documento","CPF/CNPJ"],
      ["email","E-mail"],
      ["endereco","Endereço"]
    ]
  },
  produtos: {
    title: "Estoque",
    fields: [
      ["nome","Produto/equipamento"],
      ["codigo","Código"],
      ["quantidade","Quantidade","number"],
      ["custo","Custo unitário","number"],
      ["preco","Preço de venda","number"]
    ]
  },
  vendas: {
    title: "Vendas",
    fields: [
      ["cliente","Cliente"],
      ["descricao","Descrição"],
      ["valor","Valor total","number"],
      ["forma","Forma de pagamento"],
      ["status","Status"]
    ]
  },
  promissorias: {
    title: "Notas promissórias",
    fields: [
      ["cliente","Cliente"],
      ["numero","Número da nota"],
      ["valor","Valor","number"],
      ["emissao","Emissão","date"],
      ["vencimento","Vencimento","date"],
      ["status","Situação"]
    ]
  },
  ordens: {
    title: "Ordens de serviço",
    fields: [
      ["cliente","Cliente"],
      ["equipamento","Produto/equipamento"],
      ["defeito","Defeito relatado"],
      ["servico","Serviço executado"],
      ["responsavel","Responsável"],
      ["status","Status"],
      ["valor","Valor","number"]
    ]
  },
  caixa: {
    title: "Fluxo de caixa",
    fields: [
      ["tipo","Tipo (Entrada/Saída)"],
      ["descricao","Descrição"],
      ["categoria","Categoria"],
      ["valor","Valor","number"],
      ["data","Data","date"]
    ]
  }
};

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginError").textContent = "";

  try {
    await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")
      .then(({ signInWithEmailAndPassword }) =>
        signInWithEmailAndPassword(
          auth,
          $("#email").value.trim(),
          $("#password").value
        )
      );
  } catch (err) {
    console.error(err);
    $("#loginError").textContent =
      "Falha no acesso. Confira e-mail e senha.";
  }
});

$("#logout").onclick = async () => {
  const { signOut } = await import(
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"
  );
  await signOut(auth);
};

const { onAuthStateChanged } = await import(
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"
);

onAuthStateChanged(auth, async u => {
  user = u;

  $("#login").hidden = !!u;
  $("#app").hidden = !u;

  if (u) {
    $("#userEmail").textContent = u.email;
    render();
  }
});

$("#menu").addEventListener("click", e => {
  const b = e.target.closest("button[data-page]");
  if (!b) return;

  page = b.dataset.page;

  document.querySelectorAll("#menu button").forEach(x =>
    x.classList.toggle("selected", x === b)
  );

  render();
});

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

async function render() {
  try {
    if (page === "dashboard") {
      const [
        clientes,
        produtos,
        vendas,
        ordens,
        caixa
      ] = await Promise.all([
        "clientes",
        "produtos",
        "vendas",
        "ordens",
        "caixa"
      ].map(getRows));

      const entradas = caixa
        .filter(x => String(x.tipo).toLowerCase().startsWith("ent"))
        .reduce((a, x) => a + (Number(x.valor) || 0), 0);

      const saidas = caixa
        .filter(x => String(x.tipo).toLowerCase().startsWith("sa"))
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
          Atenção: versão inicial do sistema.
          Os cadastros são compartilhados entre os usuários autenticados.
        </div>
      `;
      return;
    }

    const cfg = configs[page];

    if (!cfg) return;

    const data = await getRows(page);

    const fields = cfg.fields.map(([k, l, t]) => `
      <label>
        ${l}
        <input
          name="${k}"
          type="${t || "text"}"
          ${t === "number" ? 'step="0.01"' : ""}
          required
        >
      </label>
    `).join("");

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
            ${
              data.map(r => `
                <tr>
                  ${cfg.fields.map(([k]) => `
                    <td>
                      ${
                        ["valor","custo","preco"].includes(k)
                          ? brl(r[k])
                          : esc(r[k])
                      }
                    </td>
                  `).join("")}

                  <td>
                    <div class="actions">
                      <button class="danger" data-delete="${r.id}">
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              `).join("")
              ||
              `<tr>
                <td class="empty" colspan="${cfg.fields.length + 1}">
                  Nenhum registro cadastrado.
                </td>
              </tr>`
            }
          </tbody>
        </table>
      </div>
    `;

    $("#recordForm").addEventListener("submit", async e => {
      e.preventDefault();

      const fd = new FormData(e.currentTarget);
      const record = Object.fromEntries(fd.entries());

      for (const [k, , t] of cfg.fields) {
        if (t === "number") {
          record[k] = Number(record[k]);
        }
      }

      record.criadoPor = user.uid;
      record.criadoEm = serverTimestamp();

      try {
        await push(ref(db, page), record);
        await render();
      } catch (err) {
        alert("Erro ao salvar: " + err.message);
      }
    });

    content.querySelectorAll("[data-delete]").forEach(b => {
      b.onclick = async () => {
        if (confirm("Excluir este registro?")) {
          try {
            await remove(ref(db, `${page}/${b.dataset.delete}`));
            await render();
          } catch (err) {
            alert("Erro ao excluir: " + err.message);
          }
        }
      };
    });

  } catch (err) {
    console.error(err);

    content.innerHTML = `
      <div class="panel">
        <h2>Não foi possível carregar</h2>
        <p>${esc(err.message)}</p>
        <p>Confira a configuração do Firebase e as regras do Realtime Database.</p>
      </div>
    `;
  }
}

function metric(t, v) {
  return `
    <div class="metric">
      <span>${t}</span>
      <strong>${v}</strong>
    </div>
  `;
}
