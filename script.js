// ==========================================================
// CONFIGURAÇÃO DO APPS SCRIPT
// ==========================================================
// Cole aqui a URL /exec do Web App publicado no Google Apps Script.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySLvK8VVHHVAWopIIRT0L5RoabFAQDbeTeXWU0-Opnr8GPYKP8iLH37l1r4iFY_3IzHQ/exec";

// Atualização automática da planilha no app.
// 60000 = 1 minuto. Use 0 para desativar.
const AUTO_REFRESH_MS = 60000;

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
    {month:"Agosto/2026",date:"10/08",history:"DEPÓSITO",description:"Crédito mensal demonstrativo",value:"R$ 1.248,10",partialBalance:"R$ 17.038,90"},
    {month:"Agosto/2026",date:"05/08",history:"JAM",description:"Atualização monetária demonstrativa",value:"R$ 68,42",partialBalance:"R$ 15.790,80"},
    {month:"Julho/2026",date:"10/07",history:"DEPÓSITO",description:"Crédito mensal demonstrativo",value:"R$ 1.220,00",partialBalance:"R$ 15.722,38"},
    {month:"Julho/2026",date:"05/07",history:"JAM",description:"Atualização monetária demonstrativa",value:"R$ 61,73",partialBalance:"R$ 14.502,38"}
  ]
};

let state = structuredClone(mockSheetData);
const $ = s => document.querySelector(s);

function isConfigured(){
  return APPS_SCRIPT_URL &&
    !APPS_SCRIPT_URL.startsWith("COLE_") &&
    APPS_SCRIPT_URL.includes("/exec");
}

function formatBRL(v){
  const raw = String(v ?? "").trim();
  return raw.startsWith("R$") ? raw : `R$ ${raw}`;
}

function setSyncStatus(text, mode){
  const el = $("#syncStatus");
  el.textContent = text;
  el.className = `sync-status ${mode}`;
}

// ==========================================================
// PLANILHA -> APP
// Leitura por JSONP, evitando dependência de CORS.
// ==========================================================
function loadFromSheet(){
  return new Promise((resolve,reject)=>{
    if(!isConfigured()){
      setSyncStatus("Não configurado","offline");
      renderApp();
      resolve(state);
      return;
    }

    setSyncStatus("Carregando...","busy");

    const callbackName = "__sheetCallback_" + Date.now() + "_" + Math.floor(Math.random()*10000);
    const script = document.createElement("script");

    const timeout = setTimeout(()=>{
      cleanup();
      setSyncStatus("Falha ao carregar","offline");
      reject(new Error("Tempo esgotado ao consultar a planilha."));
    },15000);

    function cleanup(){
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = payload=>{
      cleanup();

      if(!payload || payload.ok === false){
        setSyncStatus("Erro na planilha","offline");
        reject(new Error(payload?.message || "Resposta inválida do Apps Script."));
        return;
      }

      if(!payload.data){
        setSyncStatus("Resposta inválida","offline");
        reject(new Error("O Apps Script não retornou o campo data."));
        return;
      }

      state = payload.data;
      renderApp();

      if($("#adminModal").classList.contains("open")){
        syncAdminInputs();
        renderTransactionEditor();
      }

      setSyncStatus("Sincronizado","online");
      resolve(state);
    };

    const sep = APPS_SCRIPT_URL.includes("?") ? "&" : "?";
    script.src =
      `${APPS_SCRIPT_URL}${sep}action=read&callback=${encodeURIComponent(callbackName)}&_=${Date.now()}`;

    script.onerror = ()=>{
      cleanup();
      setSyncStatus("Falha ao carregar","offline");
      reject(new Error("Não foi possível carregar o Apps Script."));
    };

    document.head.appendChild(script);
  });
}

// ==========================================================
// APP -> PLANILHA
// Escrita por POST no-cors. Depois recarrega a planilha
// e compara com o estado enviado para confirmar o salvamento.
// ==========================================================
async function saveToSheet(){
  if(!isConfigured()){
    alert("Cole a URL /exec do Apps Script em APPS_SCRIPT_URL no script.js.");
    return;
  }

  const adminKey = $("#adminKeyInput").value.trim();
  if(!adminKey){
    alert("Digite a senha administrativa.");
    return;
  }

  const snapshot = structuredClone(state);
  const expected = canonicalState(snapshot);

  if($("#rememberKeyInput").checked){
    sessionStorage.setItem("fgts_admin_key",adminKey);
  }else{
    sessionStorage.removeItem("fgts_admin_key");
  }

  setSyncStatus("Salvando...","busy");
  $("#saveSheetBtn").disabled = true;

  try{
    // text/plain evita preflight. mode:no-cors evita bloqueio de resposta
    // em navegadores quando o Apps Script não expõe CORS.
    await fetch(APPS_SCRIPT_URL,{
      method:"POST",
      mode:"no-cors",
      cache:"no-store",
      headers:{
        "Content-Type":"text/plain;charset=UTF-8"
      },
      body:JSON.stringify({
        action:"save",
        adminKey,
        data:snapshot
      })
    });

    // O POST no-cors retorna resposta opaca. Confirmamos pela leitura.
    await sleep(900);
    const fresh = await loadFromSheet();

    if(canonicalState(fresh) !== expected){
      setSyncStatus("Não confirmado","offline");
      alert(
        "A gravação não foi confirmada. Verifique a senha administrativa e a implantação do Apps Script."
      );
      return;
    }

    setSyncStatus("Salvo na planilha","online");
    alert("Alterações salvas na planilha com sucesso.");
  }catch(err){
    console.error(err);
    setSyncStatus("Erro ao salvar","offline");
    alert(err.message);
  }finally{
    $("#saveSheetBtn").disabled = false;
  }
}

function canonicalState(obj){
  return JSON.stringify({
    worker:{
      firstName:String(obj.worker?.firstName ?? ""),
      fullName:String(obj.worker?.fullName ?? ""),
      pis:String(obj.worker?.pis ?? ""),
      ctps:String(obj.worker?.ctps ?? "")
    },
    account:{
      company:String(obj.account?.company ?? ""),
      balance:String(obj.account?.balance ?? ""),
      blocked:String(obj.account?.blocked ?? ""),
      rescisory:String(obj.account?.rescisory ?? "")
    },
    transactions:(obj.transactions || []).map(tx=>({
      month:String(tx.month ?? ""),
      date:String(tx.date ?? ""),
      history:String(tx.history ?? ""),
      description:String(tx.description ?? ""),
      value:String(tx.value ?? ""),
      partialBalance:String(tx.partialBalance ?? "")
    }))
  });
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

// ==========================================================
// UI
// ==========================================================
function renderApp(){
  $("#homeUserName").textContent = state.worker?.firstName || "";
  $("#totalBalance").textContent = formatBRL(state.account?.balance || "0,00");
  $("#homeCompany").textContent = state.account?.company || "";
  $("#homeAccountBalance").textContent = formatBRL(state.account?.balance || "0,00");
  $("#detailCompany").textContent = state.account?.company || "";
  $("#detailBalance").textContent = formatBRL(state.account?.balance || "0,00");
  $("#blockedValue").textContent = formatBRL(state.account?.blocked || "0,00");
  renderTransactions();
}

function renderTransactions(){
  const container = $("#transactionsContainer");
  container.innerHTML = "";

  const grouped = (state.transactions || []).reduce((acc,item)=>{
    (acc[item.month || "Outros"] ||= []).push(item);
    return acc;
  },{});

  Object.entries(grouped).forEach(([month,items])=>{
    const title = document.createElement("div");
    title.className = "month-title";
    title.textContent = month;

    const list = document.createElement("div");
    list.className = "tx-list";

    items.forEach(tx=>{
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
        </div>`;
      list.appendChild(row);
    });

    container.append(title,list);
  });
}

function showScreen(name){
  $("#screenHome").classList.toggle("active",name==="home");
  $("#screenDetail").classList.toggle("active",name==="detail");
  window.scrollTo(0,0);
}

$("#accountCard").addEventListener("click",()=>showScreen("detail"));
$("#backBtn").addEventListener("click",()=>showScreen("home"));

$("#syncBtn").addEventListener("click",async()=>{
  try{
    await loadFromSheet();
  }catch(err){
    alert(err.message);
  }
});

// ==========================================================
// ADMIN
// ==========================================================
function openAdmin(){
  syncAdminInputs();
  renderTransactionEditor();

  const savedKey = sessionStorage.getItem("fgts_admin_key");
  if(savedKey){
    $("#adminKeyInput").value = savedKey;
    $("#rememberKeyInput").checked = true;
  }

  $("#adminModal").classList.add("open");
}

function closeAdmin(){
  $("#adminModal").classList.remove("open");
}

$("#editFab").addEventListener("click",openAdmin);
$("#closeModalBtn").addEventListener("click",closeAdmin);
$("#adminModal").addEventListener("click",e=>{
  if(e.target.id==="adminModal") closeAdmin();
});

function syncAdminInputs(){
  $("#companyInput").value = state.account?.company || "";
  $("#balanceInput").value = state.account?.balance || "";
  $("#blockedInput").value = state.account?.blocked || "";
  $("#rescisoryInput").value = state.account?.rescisory || "";
}

["companyInput","balanceInput","blockedInput","rescisoryInput"].forEach(id=>{
  $(`#${id}`).addEventListener("input",()=>{
    state.account.company = $("#companyInput").value;
    state.account.balance = $("#balanceInput").value;
    state.account.blocked = $("#blockedInput").value;
    state.account.rescisory = $("#rescisoryInput").value;
    renderApp();
  });
});

function renderTransactionEditor(){
  const root = $("#transactionsEditor");
  root.innerHTML = "";

  (state.transactions || []).forEach((tx,index)=>{
    const card = document.createElement("div");
    card.className = "tx-editor";
    card.innerHTML = `
      <div class="tx-editor-grid">
        <div class="form-field"><label>Mês</label><input data-i="${index}" data-k="month" value="${escapeAttr(tx.month)}"></div>
        <div class="form-field"><label>Data</label><input data-i="${index}" data-k="date" value="${escapeAttr(tx.date)}"></div>
        <div class="form-field"><label>Histórico</label><input data-i="${index}" data-k="history" value="${escapeAttr(tx.history)}"></div>
        <div class="form-field"><label>Descrição</label><input data-i="${index}" data-k="description" value="${escapeAttr(tx.description || "")}"></div>
        <div class="form-field"><label>Valor</label><input data-i="${index}" data-k="value" value="${escapeAttr(tx.value)}"></div>
        <div class="form-field"><label>Saldo parcial</label><input data-i="${index}" data-k="partialBalance" value="${escapeAttr(tx.partialBalance)}"></div>
      </div>
      <button class="danger-btn" type="button" data-remove="${index}">Remover</button>`;
    root.appendChild(card);
  });

  root.querySelectorAll("input[data-i]").forEach(input=>{
    input.addEventListener("input",e=>{
      state.transactions[Number(e.target.dataset.i)][e.target.dataset.k] = e.target.value;
      renderTransactions();
    });
  });

  root.querySelectorAll("[data-remove]").forEach(btn=>{
    btn.addEventListener("click",e=>{
      state.transactions.splice(Number(e.target.dataset.remove),1);
      renderTransactionEditor();
      renderTransactions();
    });
  });
}

$("#addTransactionBtn").addEventListener("click",()=>{
  state.transactions.push({
    month:"Agosto/2026",
    date:"01/08",
    history:"LANÇAMENTO",
    description:"Descrição",
    value:"R$ 0,00",
    partialBalance:formatBRL(state.account.balance)
  });
  renderTransactionEditor();
  renderTransactions();
});

$("#reloadSheetBtn").addEventListener("click",async()=>{
  try{
    await loadFromSheet();
  }catch(err){
    alert(err.message);
  }
});

$("#saveSheetBtn").addEventListener("click",saveToSheet);

$("#resetBtn").addEventListener("click",()=>{
  state = structuredClone(mockSheetData);
  syncAdminInputs();
  renderTransactionEditor();
  renderApp();
});

$("#exportJsonBtn").addEventListener("click",()=>{
  const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
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
$("#pdfBtn").addEventListener("click",()=>{
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({unit:"mm",format:"a4"});
  const left = 14;
  let y = 16;

  doc.setTextColor(225,225,225);
  doc.setFontSize(30);
  doc.text("DEMONSTRAÇÃO • SEM VALIDADE OFICIAL",105,145,{align:"center",angle:35});

  doc.setTextColor(16,53,78);
  doc.setFont("helvetica","bold");
  doc.setFontSize(20);
  doc.text("FGTS DEMO",left,y);

  doc.setFont("helvetica","normal");
  doc.setFontSize(9.5);
  doc.setTextColor(20,28,36);
  y += 12;

  doc.text(`Nome: ${state.worker.fullName}`,left,y); y+=5;
  doc.text(`PIS/PASEP: ${state.worker.pis}`,left,y); y+=5;
  doc.text(`CTPS: ${state.worker.ctps}`,left,y); y+=8;
  doc.text(`Empregador: ${state.account.company}`,left,y); y+=5;
  doc.text(`Saldo: ${formatBRL(state.account.balance)}`,left,y); y+=5;
  doc.text(`Saldo bloqueado: ${formatBRL(state.account.blocked)}`,left,y); y+=10;

  state.transactions.forEach(tx=>{
    if(y>275){doc.addPage();y=18;}
    const line = `${tx.date}  ${tx.month}  ${tx.history}  ${tx.value}  ${tx.partialBalance}`;
    doc.text(doc.splitTextToSize(line,180),left,y);
    y += 7;
  });

  doc.setTextColor(160,54,44);
  doc.setFont("helvetica","bold");
  y += 5;
  doc.text("DOCUMENTO DEMONSTRATIVO • NÃO UTILIZAR COMO COMPROVANTE",left,y);

  doc.save("extrato-fgts-demo.pdf");
});

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(value){return escapeHtml(value)}

renderApp();

if(isConfigured()){
  loadFromSheet().catch(err=>console.error(err));
}else{
  setSyncStatus("Não configurado","offline");
}

if(AUTO_REFRESH_MS > 0){
  setInterval(()=>{
    if(isConfigured() && !$("#adminModal").classList.contains("open")){
      loadFromSheet().catch(err=>console.error(err));
    }
  },AUTO_REFRESH_MS);
}
