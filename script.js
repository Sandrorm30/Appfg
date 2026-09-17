// ==========================================================
// CONFIGURAÇÃO DA INTEGRAÇÃO COM GOOGLE SHEETS
// ==========================================================
//
// 1) Cole abaixo a URL do seu Web App do Google Apps Script.
// 2) Exemplo:
//    https://script.google.com/macros/s/SEU_DEPLOYMENT_ID/exec
//
// Enquanto a URL estiver vazia, o app usa mockSheetData como fallback.
//
const GOOGLE_SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbxqaSJTD7dIi3ukMZQfHvJh0gFSctFis2TB-IhBVSRCCjfPMkCD2zXjWqjZ2_mwugFKhQ/exec";

// Atualização automática dos dados da planilha (em milissegundos).
// 60000 = 1 minuto. Use 0 para desativar.
const AUTO_REFRESH_MS = 60000;


// ==========================================================
// FALLBACK LOCAL
// ==========================================================
const mockSheetData = {
  worker: {
    firstName: "SANDRO",
    fullName: "SANDRO RIBEIRO MEDEIROS",
    pis: "000.00000.00-0",
    ctps: "0000000/0000"
  },
  account: {
    company: "PREF MUNIC RIO GRANDE",
    balance: "17.038,90",
    blocked: "11.461,58",
    rescisory: "17.038,90"
  },
  transactions: [
    {
      month: "Agosto/2026",
      date: "10/08",
      history: "DEPÓSITO",
      description: "Crédito mensal demonstrativo",
      value: "R$ 1.248,10",
      partialBalance: "R$ 17.038,90"
    },
    {
      month: "Agosto/2026",
      date: "05/08",
      history: "JAM",
      description: "Atualização monetária demonstrativa",
      value: "R$ 68,42",
      partialBalance: "R$ 15.790,80"
    },
    {
      month: "Julho/2026",
      date: "10/07",
      history: "DEPÓSITO",
      description: "Crédito mensal demonstrativo",
      value: "R$ 1.220,00",
      partialBalance: "R$ 15.722,38"
    },
    {
      month: "Julho/2026",
      date: "05/07",
      history: "JAM",
      description: "Atualização monetária demonstrativa",
      value: "R$ 61,73",
      partialBalance: "R$ 14.502,38"
    }
  ]
};

let state = structuredClone(mockSheetData);

const $ = (selector) => document.querySelector(selector);

const formatBRL = (value) => {
  const raw = String(value ?? "").trim();
  return raw.startsWith("R$") ? raw : `R$ ${raw}`;
};


// ==========================================================
// CARREGAMENTO DA PLANILHA
// ==========================================================
async function loadGoogleSheetData({ silent = false } = {}) {
  if (!GOOGLE_SHEETS_API_URL) {
    if (!silent) console.info("Google Sheets API ainda não configurada. Usando dados locais.");
    state = structuredClone(mockSheetData);
    renderApp();
    return;
  }

  try {
    // cache-buster garante que o navegador consulte a versão atual.
    const separator = GOOGLE_SHEETS_API_URL.includes("?") ? "&" : "?";
    const url = `${GOOGLE_SHEETS_API_URL}${separator}_=${Date.now()}`;

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    validateSheetData(data);
    state = data;
    renderApp();

    if (!silent) console.info("Dados carregados da planilha com sucesso.");
  } catch (error) {
    console.error("Falha ao carregar Google Sheets:", error);

    // Mantemos o último estado válido para o app continuar funcionando.
    if (!silent) {
      alert(
        "Não foi possível carregar a planilha. " +
        "O aplicativo continuará exibindo o último conjunto de dados disponível."
      );
    }

    renderApp();
  }
}

function validateSheetData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("JSON inválido.");
  }

  if (!data.worker || !data.account || !Array.isArray(data.transactions)) {
    throw new Error("Estrutura da planilha incompatível.");
  }
}


// ==========================================================
// RENDERIZAÇÃO
// ==========================================================
function renderApp() {
  $("#homeUserName").textContent = state.worker.firstName || "";
  $("#totalBalance").textContent = formatBRL(state.account.balance);
  $("#homeCompany").textContent = state.account.company || "";
  $("#homeAccountBalance").textContent = formatBRL(state.account.balance);

  $("#detailCompany").textContent = state.account.company || "";
  $("#detailBalance").textContent = formatBRL(state.account.balance);
  $("#blockedValue").textContent = formatBRL(state.account.blocked);

  renderTransactions();
}

function renderTransactions() {
  const container = $("#transactionsContainer");
  container.innerHTML = "";

  const grouped = state.transactions.reduce((acc, item) => {
    const month = item.month || "Outros";
    (acc[month] ||= []).push(item);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([month, items]) => {
    const title = document.createElement("div");
    title.className = "month-title";
    title.textContent = month;

    const list = document.createElement("div");
    list.className = "tx-list";

    items.forEach((tx) => {
      const row = document.createElement("div");
      row.className = "tx-row";
      row.innerHTML = `
        <div class="tx-date">${escapeHtml(tx.date)}</div>
        <div class="tx-history">
          ${escapeHtml(tx.history)}
          <span class="tx-meta">${escapeHtml(tx.description || "")}</span>
        </div>
        <div class="tx-values">
          ${escapeHtml(tx.value)}
          <div class="tx-partial">Saldo: ${escapeHtml(tx.partialBalance)}</div>
        </div>
      `;
      list.appendChild(row);
    });

    container.appendChild(title);
    container.appendChild(list);
  });
}

function showScreen(name) {
  $("#screenHome").classList.toggle("active", name === "home");
  $("#screenDetail").classList.toggle("active", name === "detail");
  window.scrollTo({ top: 0, behavior: "instant" });
}

$("#accountCard").addEventListener("click", () => showScreen("detail"));
$("#backBtn").addEventListener("click", () => showScreen("home"));


// ==========================================================
// MODO ADMINISTRADOR LOCAL
// ==========================================================
//
// O painel continua editando o estado local em tempo real.
// Para persistir alterações na planilha, é necessário um endpoint
// autenticado no servidor. Não coloque senha/API secret no GitHub Pages.
//
function openAdmin() {
  syncAdminInputs();
  renderTransactionEditor();
  $("#adminModal").classList.add("open");
  $("#adminModal").setAttribute("aria-hidden", "false");
}

function closeAdmin() {
  $("#adminModal").classList.remove("open");
  $("#adminModal").setAttribute("aria-hidden", "true");
}

$("#editFab").addEventListener("click", openAdmin);
$("#closeModalBtn").addEventListener("click", closeAdmin);
$("#adminModal").addEventListener("click", (e) => {
  if (e.target.id === "adminModal") closeAdmin();
});

function syncAdminInputs() {
  $("#companyInput").value = state.account.company || "";
  $("#balanceInput").value = state.account.balance || "";
  $("#blockedInput").value = state.account.blocked || "";
  $("#rescisoryInput").value = state.account.rescisory || "";
}

["companyInput", "balanceInput", "blockedInput", "rescisoryInput"].forEach((id) => {
  $(`#${id}`).addEventListener("input", () => {
    state.account.company = $("#companyInput").value;
    state.account.balance = $("#balanceInput").value;
    state.account.blocked = $("#blockedInput").value;
    state.account.rescisory = $("#rescisoryInput").value;
    renderApp();
  });
});

function renderTransactionEditor() {
  const root = $("#transactionsEditor");
  root.innerHTML = "";

  state.transactions.forEach((tx, index) => {
    const card = document.createElement("div");
    card.className = "tx-editor";
    card.innerHTML = `
      <div class="tx-editor-grid">
        <div class="form-field">
          <label>Mês</label>
          <input data-i="${index}" data-k="month" value="${escapeAttr(tx.month)}" />
        </div>
        <div class="form-field">
          <label>Data</label>
          <input data-i="${index}" data-k="date" value="${escapeAttr(tx.date)}" />
        </div>
        <div class="form-field">
          <label>Histórico</label>
          <input data-i="${index}" data-k="history" value="${escapeAttr(tx.history)}" />
        </div>
        <div class="form-field">
          <label>Descrição</label>
          <input data-i="${index}" data-k="description" value="${escapeAttr(tx.description || "")}" />
        </div>
        <div class="form-field">
          <label>Valor</label>
          <input data-i="${index}" data-k="value" value="${escapeAttr(tx.value)}" />
        </div>
        <div class="form-field">
          <label>Saldo parcial</label>
          <input data-i="${index}" data-k="partialBalance" value="${escapeAttr(tx.partialBalance)}" />
        </div>
      </div>
      <button class="danger-btn remove-tx" type="button" data-remove="${index}">Remover</button>
    `;
    root.appendChild(card);
  });

  root.querySelectorAll("input[data-i]").forEach((input) => {
    input.addEventListener("input", (e) => {
      const index = Number(e.target.dataset.i);
      const key = e.target.dataset.k;
      state.transactions[index][key] = e.target.value;
      renderTransactions();
    });
  });

  root.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", (e) => {
      state.transactions.splice(Number(e.target.dataset.remove), 1);
      renderTransactionEditor();
      renderTransactions();
    });
  });
}

$("#addTransactionBtn").addEventListener("click", () => {
  state.transactions.push({
    month: "Agosto/2026",
    date: "01/08",
    history: "LANÇAMENTO",
    description: "Descrição",
    value: "R$ 0,00",
    partialBalance: formatBRL(state.account.balance)
  });

  renderTransactionEditor();
  renderTransactions();
});

$("#resetBtn").addEventListener("click", async () => {
  if (GOOGLE_SHEETS_API_URL) {
    await loadGoogleSheetData();
    syncAdminInputs();
    renderTransactionEditor();
  } else {
    state = structuredClone(mockSheetData);
    syncAdminInputs();
    renderTransactionEditor();
    renderApp();
  }
});

$("#exportJsonBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dados-fgts-demo.json";
  a.click();
  URL.revokeObjectURL(url);
});


// ==========================================================
// PDF DEMONSTRATIVO
// ==========================================================
$("#pdfBtn").addEventListener("click", generatePdf);

function generatePdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const left = 14;
  let y = 16;

  doc.saveGraphicsState();
  doc.setTextColor(225, 225, 225);
  doc.setFontSize(30);
  doc.text("DEMONSTRAÇÃO • SEM VALIDADE OFICIAL", 105, 145, {
    align: "center",
    angle: 35
  });
  doc.restoreGraphicsState();

  doc.setTextColor(16, 53, 78);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("FGTS DEMO", left, y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 90, 98);
  doc.text("Extrato demonstrativo gerado por protótipo web", left, y + 6);

  y += 17;
  doc.setDrawColor(200, 208, 214);
  doc.line(left, y, 196, y);
  y += 8;

  doc.setTextColor(20, 28, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Dados do trabalhador", left, y);

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`Nome: ${state.worker.fullName}`, left, y);
  y += 5;
  doc.text(`PIS/PASEP: ${state.worker.pis}`, left, y);
  y += 5;
  doc.text(`CTPS: ${state.worker.ctps}`, left, y);

  y += 9;
  doc.setFont("helvetica", "bold");
  doc.text("Conta vinculada", left, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Empregador: ${state.account.company}`, left, y);
  y += 5;
  doc.text(`Saldo: ${formatBRL(state.account.balance)}`, left, y);
  y += 5;
  doc.text(`Saldo bloqueado: ${formatBRL(state.account.blocked)}`, left, y);
  y += 5;
  doc.text(`Valor para fins rescisórios: ${formatBRL(state.account.rescisory)}`, left, y);

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Movimentações", left, y);
  y += 6;

  const col = { date: left, history: 34, value: 138, balance: 168 };

  doc.setFillColor(238, 243, 246);
  doc.rect(left, y - 4, 182, 7, "F");
  doc.setFontSize(8.5);
  doc.text("Data", col.date, y);
  doc.text("Histórico", col.history, y);
  doc.text("Valor", col.value, y);
  doc.text("Saldo", col.balance, y);
  y += 6;

  doc.setFont("helvetica", "normal");

  state.transactions.forEach((tx) => {
    if (y > 274) {
      doc.addPage();
      y = 18;
    }

    const history =
      `${tx.month} • ${tx.history}` +
      (tx.description ? ` - ${tx.description}` : "");

    const lines = doc.splitTextToSize(history, 96);

    doc.text(tx.date, col.date, y);
    doc.text(lines, col.history, y);
    doc.text(tx.value, col.value, y);
    doc.text(tx.partialBalance, col.balance, y);

    y += Math.max(7, lines.length * 4.2 + 2);
    doc.setDrawColor(225, 229, 232);
    doc.line(left, y - 2, 196, y - 2);
  });

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(160, 54, 44);
  doc.text(
    "DOCUMENTO DEMONSTRATIVO • NÃO UTILIZAR COMO COMPROVANTE",
    left,
    y
  );

  doc.save("extrato-fgts-demo.pdf");
}


// ==========================================================
// HELPERS
// ==========================================================
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}


// ==========================================================
// INICIALIZAÇÃO
// ==========================================================
loadGoogleSheetData();

if (AUTO_REFRESH_MS > 0) {
  setInterval(() => {
    // Evita sobrescrever edição enquanto o modal está aberto.
    if (!$("#adminModal").classList.contains("open")) {
      loadGoogleSheetData({ silent: true });
    }
  }, AUTO_REFRESH_MS);
}
