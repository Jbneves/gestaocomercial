
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  ref,
  push,
  get,
  remove,
  update,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

import { auth, db } from "./firebase-config.js";

const $ = s => document.querySelector(s);
const content = $("#content");

let page = "dashboard";
let user = null;

let clients = [];
let products = [];
let cart = [];
let payments = [];
let selectedClient = null;

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

async function getRows(name) {
  const snapshot = await get(ref(db, name));

  if (!snapshot.exists()) return [];

  return Object.entries(snapshot.val()).map(([id, value]) => ({
    id,
    ...value
  }));
}

function metric(t, v) {
  return `
    <div class="metric">
      <span>${t}</span>
      <strong>${v}</strong>
    </div>
  `;
}

// LOGIN

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
    console.error(err);
    $("#loginError").textContent =
      "Falha no acesso. Confira e-mail e senha.";
  }
});

$("#logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async u => {
  user = u;

  $("#login").hidden = !!u;
  $("#app").hidden = !u;

  if (u) {
    $("#userEmail").textContent = u.email;
    render();
  }
});

// MENU

$("#menu").addEventListener("click", e => {
  const b = e.target.closest("button[data-page]");
  if (!b) return;

  page = b.dataset.page;

  document.querySelectorAll("#menu button").forEach(x =>
    x.classList.toggle("selected", x === b)
  );

  render();
});

// RENDERIZAÇÃO PRINCIPAL

async function render() {
  try {
    if (page === "vendas") {
      await renderSales();
      return;
    }

    if (page === "dashboard") {
      const [
        clientes,
        produtos,
        vendas,
        ordens,
        caixa,
        promissorias
      ] = await Promise.all([
        "clientes",
        "produtos",
        "vendas",
        "ordens",
        "caixa",
        "promissorias"
      ].map(getRows));

      const entradas = caixa
        .filter(x => String(x.tipo).toLowerCase().startsWith("ent"))
        .reduce((a, x) => a + (+x.valor || 0), 0);

      const saidas = caixa
        .filter(x => String(x.tipo).toLowerCase().startsWith("sa"))
        .reduce((a, x) => a + (+x.valor || 0), 0);

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
          ${metric("Notas promissórias", promissorias.length)}
          ${metric("Entradas de caixa", brl(entradas))}
          ${metric("Saídas de caixa", brl(saidas))}
          ${metric("Saldo de caixa", brl(entradas - saidas))}
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
        <input name="${k}" type="${t || "text"}"
          ${t === "number" ? 'step="0.01"' : ""}
          required>
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
            ${data.map(r => `
              <tr>
                ${cfg.fields.map(([k]) => `
                  <td>
                    ${["valor","custo","preco"].includes(k)
                      ? brl(r[k])
                      : esc(r[k])}
                  </td>
                `).join("")}
                <td>
                  <button class="danger" data-delete="${r.id}">
                    Excluir
                  </button>
                </td>
              </tr>
            `).join("") || `
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

    $("#recordForm").addEventListener("submit", async e => {
      e.preventDefault();

      const fd = new FormData(e.currentTarget);
      const record = Object.fromEntries(fd.entries());

      for (const [k, , t] of cfg.fields) {
        if (t === "number") record[k] = Number(record[k]);
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
        if (!confirm("Excluir este registro?")) return;

        try {
          await remove(ref(db, `${page}/${b.dataset.delete}`));
          await render();
        } catch (err) {
          alert("Erro ao excluir: " + err.message);
        }
      };
    });

  } catch (err) {
    console.error(err);
    content.innerHTML = `
      <div class="panel">
        <h2>Não foi possível carregar</h2>
        <p>${esc(err.message)}</p>
      </div>
    `;
  }
}

// TELA DE VENDAS

async function renderSales() {
  clients = await getRows("clientes");
  products = await getRows("produtos");

  const sales = await getRows("vendas");

  cart = [];
  payments = [{ metodo: "Dinheiro", valor: 0 }];
  selectedClient = null;

  content.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Nova venda</h2>
        <span class="muted">PDV - Ponto de venda</span>
      </div>
    </div>

    <div class="pdv">

      <div>

        <div class="panel">
          <h3>1. Selecionar cliente</h3>

          <input id="clientSearch"
            placeholder="Digite o nome ou CPF/CNPJ do cliente..."
            autocomplete="off">

          <div id="clientResults" class="pdv-results"></div>

          <div id="selectedClient" class="success"></div>
        </div>

        <div class="panel">
          <h3>2. Adicionar produtos</h3>

          <input id="productSearch"
            placeholder="Digite o nome ou código do produto..."
            autocomplete="off">

          <div id="productResults" class="pdv-results"></div>
        </div>

        <div class="panel pdv-cart">
          <h3>3. Carrinho de compras</h3>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Preço</th>
                  <th>Qtd.</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="cartRows">
                <tr>
                  <td colspan="5" class="empty">
                    Nenhum produto adicionado.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <div>

        <div class="panel">
          <h3>4. Pagamento</h3>

          <label>
            Desconto (R$)
            <input id="discount" type="number"
              min="0" step="0.01" value="0">
          </label>

          <div id="paymentRows"></div>

          <button type="button" class="light" id="addPayment">
            + Adicionar forma de pagamento
          </button>

          <div id="dueDateArea"></div>

          <div class="pdv-total">
            <div>Subtotal: <strong id="subtotal">R$ 0,00</strong></div>
            <div>Desconto: <strong id="discountValue">R$ 0,00</strong></div>
            <hr>
            <div>Total: <strong id="grandTotal">R$ 0,00</strong></div>
            <div>Pagamentos: <strong id="paymentTotal">R$ 0,00</strong></div>
            <div>Diferença: <strong id="difference">R$ 0,00</strong></div>
          </div>

          <div class="pdv-actions">
            <button type="button" id="finishSale">
              Finalizar venda
            </button>
            <button type="button" class="light" id="cancelSale">
              Cancelar
            </button>
          </div>

          <p id="saleMessage" class="note"></p>
        </div>

      </div>

    </div>

    <div class="panel" style="margin-top:18px">
      <h3>Últimas vendas</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Data</th>
              <th>Itens</th>
              <th>Total</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            ${sales.slice(-10).reverse().map(s => `
              <tr>
                <td>${esc(s.clienteNome)}</td>
                <td>${esc(s.data || "-")}</td>
                <td>${(s.itens || []).length}</td>
                <td>${brl(s.total)}</td>
                <td>${esc(s.status || "-")}</td>
              </tr>
            `).join("") || `
              <tr><td colspan="5" class="empty">
                Nenhuma venda registrada.
              </td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;

  $("#clientSearch").addEventListener("input", searchClients);
  $("#productSearch").addEventListener("input", searchProducts);

  $("#clientResults").addEventListener("click", e => {
    const b = e.target.closest("[data-client]");
    if (!b) return;

    selectedClient = clients.find(c => c.id === b.dataset.client);

    $("#clientSearch").value = "";
    $("#clientResults").innerHTML = "";

    $("#selectedClient").innerHTML =
      `Cliente selecionado: <strong>${esc(selectedClient.nome)}</strong>
       <button type="button" class="light" id="changeClient">Trocar</button>`;

    $("#changeClient").onclick = () => {
      selectedClient = null;
      $("#selectedClient").textContent = "";
    };
  });

  $("#productResults").addEventListener("click", e => {
    const b = e.target.closest("[data-product]");
    if (!b) return;

    const product = products.find(p => p.id === b.dataset.product);

    if (!product) return;

    addToCart(product);

    $("#productSearch").value = "";
    $("#productResults").innerHTML = "";
  });

  $("#cartRows").addEventListener("change", e => {
    const input = e.target.closest("[data-quantity]");
    if (!input) return;

    const item = cart.find(x => x.id === input.dataset.quantity);
    if (!item) return;

    const quantity = Math.floor(Number(input.value));

    if (!quantity || quantity < 1 || quantity > item.estoque) {
      alert("Quantidade inválida ou maior que o estoque.");
      renderCart();
      return;
    }

    item.quantidade = quantity;
    renderCart();
  });

  $("#cartRows").addEventListener("click", e => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;

    cart = cart.filter(x => x.id !== b.dataset.remove);
    renderCart();
  });

  $("#discount").addEventListener("input", updateTotals);

  $("#addPayment").onclick = () => {
    payments.push({ metodo: "PIX", valor: 0 });
    renderPayments();
  };

  $("#paymentRows").addEventListener("change", e => {
    const row = e.target.closest("[data-payment-index]");
    if (!row) return;

    const i = Number(row.dataset.paymentIndex);

    if (e.target.name === "metodo") {
      payments[i].metodo = e.target.value;
      renderPayments();
    }

    if (e.target.name === "valor") {
      payments[i].valor = Number(e.target.value);
      updateTotals();
      updateDueDate();
    }
  });

  $("#paymentRows").addEventListener("click", e => {
    const b = e.target.closest("[data-remove-payment]");
    if (!b) return;

    payments.splice(Number(b.dataset.removePayment), 1);

    if (!payments.length) {
      payments.push({ metodo: "Dinheiro", valor: 0 });
    }

    renderPayments();
  });

  $("#finishSale").onclick = finishSale;

  $("#cancelSale").onclick = () => {
    if (!confirm("Cancelar esta venda?")) return;
    page = "dashboard";
    render();
  };

  renderPayments();
  renderCart();
}

// PESQUISA DE CLIENTES

function searchClients() {
  const term = $("#clientSearch").value.toLowerCase().trim();

  const found = clients.filter(c =>
    `${c.nome} ${c.documento || ""} ${c.telefone || ""}`
      .toLowerCase().includes(term)
  ).slice(0, 15);

  $("#clientResults").innerHTML = found.map(c => `
    <div class="pdv-result" data-client="${c.id}">
      <span>${esc(c.nome)}</span>
      <small>${esc(c.documento || c.telefone || "")}</small>
    </div>
  `).join("") || `
    <div class="empty">Nenhum cliente encontrado.</div>
  `;
}

// PESQUISA DE PRODUTOS

function searchProducts() {
  const term = $("#productSearch").value.toLowerCase().trim();

  const found = products.filter(p =>
    `${p.nome} ${p.codigo || ""}`
      .toLowerCase().includes(term)
  ).slice(0, 15);

  $("#productResults").innerHTML = found.map(p => `
    <div class="pdv-result" data-product="${p.id}">
      <span>
        <strong>${esc(p.nome)}</strong><br>
        <small>Código: ${esc(p.codigo || "-")}
        | Estoque: ${Number(p.quantidade) || 0}</small>
      </span>
      <strong>${brl(p.preco)}</strong>
    </div>
  `).join("") || `
    <div class="empty">Nenhum produto encontrado.</div>
  `;
}

// CARRINHO

function addToCart(product) {
  const stock = Number(product.quantidade) || 0;

  if (stock <= 0) {
    alert("Este produto não possui estoque disponível.");
    return;
  }

  const existing = cart.find(x => x.id === product.id);

  if (existing) {
    if (existing.quantidade + 1 > stock) {
      alert("Quantidade maior que o estoque disponível.");
      return;
    }
    existing.quantidade++;
  } else {
    cart.push({
      id: product.id,
      nome: product.nome,
      codigo: product.codigo || "",
      preco: Number(product.preco) || 0,
      quantidade: 1,
      estoque: stock
    });
  }

  renderCart();
}

function subtotalCart() {
  return cart.reduce(
    (sum, item) => sum + item.preco * item.quantidade,
    0
  );
}

function getDiscount() {
  const value = Number($("#discount")?.value) || 0;
  return Math.min(Math.max(value, 0), subtotalCart());
}

function getTotal() {
  return subtotalCart() - getDiscount();
}

function renderCart() {
  $("#cartRows").innerHTML = cart.map(item => `
    <tr>
      <td>${esc(item.nome)}</td>
      <td>${brl(item.preco)}</td>
      <td>
        <input type="number"
          min="1"
          max="${item.estoque}"
          value="${item.quantidade}"
          data-quantity="${item.id}">
      </td>
      <td>${brl(item.preco * item.quantidade)}</td>
      <td>
        <button type="button" class="danger"
          data-remove="${item.id}">X</button>
      </td>
    </tr>
  `).join("") || `
    <tr><td colspan="5" class="empty">
      Nenhum produto adicionado.
    </td></tr>
  `;

  updateTotals();
}

function renderPayments() {
  $("#paymentRows").innerHTML = payments.map((p, i) => `
    <div class="panel" data-payment-index="${i}">
      <label>
        Forma de pagamento
        <select name="metodo">
          ${["Dinheiro","PIX","Cartão de débito","Cartão de crédito","Promissória"]
            .map(m => `<option ${p.metodo === m ? "selected" : ""}>${m}</option>`)
            .join("")}
        </select>
      </label>

      <label>
        Valor
        <input name="valor" type="number" min="0"
          step="0.01" value="${p.valor}">
      </label>

      ${payments.length > 1 ? `
        <button type="button" class="danger"
          data-remove-payment="${i}">Remover pagamento</button>
      ` : ""}
    </div>
  `).join("");

  updateTotals();
  updateDueDate();
}

function updateTotals() {
  const subtotal = subtotalCart();
  const discount = getDiscount();
  const total = getTotal();

  const paid = payments.reduce(
    (sum, p) => sum + (Number(p.valor) || 0), 0
  );

  $("#subtotal").textContent = brl(subtotal);
  $("#discountValue").textContent = brl(discount);
  $("#grandTotal").textContent = brl(total);
  $("#paymentTotal").textContent = brl(paid);
  $("#difference").textContent = brl(total - paid);
}

function updateDueDate() {
  const hasPromissory = payments.some(
    p => p.metodo === "Promissória" && Number(p.valor) > 0
  );

  $("#dueDateArea").innerHTML = hasPromissory ? `
    <label>
      Vencimento da promissória
      <input type="date" id="promissoryDue" required>
    </label>
  ` : "";
}

// FINALIZAR VENDA

async function finishSale() {
  const message = $("#saleMessage");
  message.textContent = "";

  if (!selectedClient) {
    alert("Selecione um cliente.");
    return;
  }

  if (!cart.length) {
    alert("Adicione pelo menos um produto.");
    return;
  }

  const total = getTotal();

  const paymentTotal = payments.reduce(
    (sum, p) => sum + (Number(p.valor) || 0), 0
  );

  if (total <= 0) {
    alert("O total da venda precisa ser maior que zero.");
    return;
  }

  if (Math.abs(total - paymentTotal) > 0.009) {
    alert("A soma dos pagamentos precisa ser igual ao total da venda.");
    return;
  }

  const promissoryValue = payments
    .filter(p => p.metodo === "Promissória")
    .reduce((sum, p) => sum + Number(p.valor || 0), 0);

  const dueDate = $("#promissoryDue")?.value || "";

  if (promissoryValue > 0 && !dueDate) {
    alert("Informe o vencimento da promissória.");
    return;
  }

  const button = $("#finishSale");
  button.disabled = true;
  button.textContent = "Processando...";

  const updatedStocks = [];

  try {
    // Conferir e baixar estoque com transações.

    for (const item of cart) {
      const stockRef = ref(db, `produtos/${item.id}/quantidade`);

      const result = await runTransaction(stockRef, current => {
        const available = Number(current) || 0;

        if (available < item.quantidade) return;

        return available - item.quantidade;
      });

      if (!result.committed) {
        throw new Error(
          `Estoque insuficiente para o produto ${item.nome}.`
        );
      }

      updatedStocks.push(item);
    }

    const saleRef = push(ref(db, "vendas"));
    const saleId = saleRef.key;

    const now = new Date();
    const date = now.toLocaleDateString("pt-BR");

    const paid = paymentTotal - promissoryValue;

    const sale = {
      clienteId: selectedClient.id,
      clienteNome: selectedClient.nome,
      itens: cart.map(item => ({
        produtoId: item.id,
        nome: item.nome,
        codigo: item.codigo,
        quantidade: item.quantidade,
        preco: item.preco,
        total: item.preco * item.quantidade
      })),
      subtotal: subtotalCart(),
      desconto: getDiscount(),
      total,
      pagamentos: payments.map(p => ({
        metodo: p.metodo,
        valor: Number(p.valor)
      })),
      valorRecebido: paid,
      valorPromissoria: promissoryValue,
      status: promissoryValue > 0
        ? (paid > 0 ? "Parcial" : "A receber")
        : "Paga",
      data: date,
      criadoPor: user.uid,
      criadoEm: serverTimestamp()
    };

    const updates = {};
    updates[`vendas/${saleId}`] = sale;

    if (promissoryValue > 0) {
      const noteRef = push(ref(db, "promissorias"));

      updates[`promissorias/${noteRef.key}`] = {
        cliente: selectedClient.nome,
        clienteId: selectedClient.id,
        numero: `VENDA-${saleId}`,
        valor: promissoryValue,
        emissao: date,
        vencimento: dueDate,
        status: "Pendente",
        vendaId: saleId,
        criadoPor: user.uid,
        criadoEm: serverTimestamp()
      };
    }

    // Registrar entradas efetivamente recebidas no caixa.

    if (paid > 0) {
      for (const payment of payments) {
        if (payment.metodo === "Promissória" || !Number(payment.valor)) {
          continue;
        }

        const cashRef = push(ref(db, "caixa"));

        updates[`caixa/${cashRef.key}`] = {
          tipo: "Entrada",
          descricao: `Venda ${saleId} - ${selectedClient.nome} - ${payment.metodo}`,
          categoria: "Venda",
          valor: Number(payment.valor),
          data: date,
          vendaId: saleId,
          criadoPor: user.uid,
          criadoEm: serverTimestamp()
        };
      }
    }

    // Grava venda, promissória e caixa.

    await update(ref(db), updates);

    alert("Venda registrada com sucesso!");

    cart = [];
    payments = [];
    selectedClient = null;

    await renderSales();

  } catch (err) {
    console.error(err);

    // Repor o estoque caso a gravação da venda falhe.

    for (const item of updatedStocks.reverse()) {
      try {
        await runTransaction(
          ref(db, `produtos/${item.id}/quantidade`),
          current => (Number(current) || 0) + item.quantidade
        );
      } catch (rollbackError) {
        console.error("Falha ao restaurar estoque:", rollbackError);
      }
    }

    alert("Não foi possível finalizar a venda: " + err.message);

    button.disabled = false;
    button.textContent = "Finalizar venda";
  }
}
