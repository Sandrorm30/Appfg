const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySLvK8VVHHVAWopIIRT0L5RoabFAQDbeTeXWU0-Opnr8GPYKP8iLH37l1r4iFY_3IzHQ/exec";
const AUTO_REFRESH_MS = 60000;

const mockSheetData = {
  worker:{firstName:"SANDRO",fullName:"SANDRO RIBEIRO MEDEIROS",pis:"",ctps:""},
  account:{company:"PREF MUNIC RIO GRANDE",balance:"17.038,90",blocked:"11.461,58",rescisory:"17.038,90"},
  transactions:[
    {month:"Agosto/2026",date:"10/08",history:"DEPÓSITO",description:"Crédito mensal demonstrativo",value:"R$ 1.248,10",partialBalance:"R$ 17.038,90"},
    {month:"Agosto/2026",date:"05/08",history:"JAM",description:"Atualização monetária demonstrativa",value:"R$ 68,42",partialBalance:"R$ 15.790,80"},
    {month:"Julho/2026",date:"10/07",history:"DEPÓSITO",description:"Crédito mensal demonstrativo",value:"R$ 1.220,00",partialBalance:"R$ 15.722,38"},
    {month:"Julho/2026",date:"05/07",history:"JAM",description:"Atualização monetária demonstrativa",value:"R$ 61,73",partialBalance:"R$ 14.502,38"}
  ]
};

let state = structuredClone(mockSheetData);
const $ = s => document.querySelector(s);
const brl = v => String(v ?? "").trim().startsWith("R$") ? String(v).trim() : `R$ ${String(v ?? "0,00").trim()}`;
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const configured = () => APPS_SCRIPT_URL && APPS_SCRIPT_URL.includes("/exec") && !APPS_SCRIPT_URL.startsWith("COLE_");
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function status(text, mode="offline"){
  const el=$("#syncStatus");
  if(el){ el.textContent=text; el.className=`sync-status ${mode}`; }
}

function renderApp(){
  $("#homeUserName") && ($("#homeUserName").textContent=state.worker?.firstName||"");
  $("#totalBalance") && ($("#totalBalance").textContent=brl(state.account?.balance));
  $("#homeCompany") && ($("#homeCompany").textContent=state.account?.company||"");
  $("#homeAccountBalance") && ($("#homeAccountBalance").textContent=brl(state.account?.balance));
  $("#detailCompany") && ($("#detailCompany").textContent=state.account?.company||"");
  $("#detailBalance") && ($("#detailBalance").textContent=brl(state.account?.balance));
  $("#blockedValue") && ($("#blockedValue").textContent=brl(state.account?.blocked));
  renderTransactions();
}

function renderTransactions(){
  const c=$("#transactionsContainer");
  if(!c) return;
  c.innerHTML="";
  const grouped=(state.transactions||[]).reduce((a,t)=>{(a[t.month||"Outros"]??=[]).push(t);return a;},{});
  Object.entries(grouped).forEach(([month,items])=>{
    const title=document.createElement("div");
    title.className="month-title";
    title.textContent=month;
    const list=document.createElement("div");
    list.className="tx-list";
    items.forEach(tx=>{
      const row=document.createElement("div");
      row.className="tx-row";
      row.innerHTML=`<div class="tx-date">${esc(tx.date)}</div>
      <div class="tx-history">${esc(tx.history)}<span class="tx-meta">${esc(tx.description||"")}</span></div>
      <div class="tx-values">${esc(tx.value)}<div class="tx-partial">Saldo: ${esc(tx.partialBalance)}</div></div>`;
      list.appendChild(row);
    });
    c.append(title,list);
  });
}

function showScreen(name){
  $("#screenHome")?.classList.toggle("active",name==="home");
  $("#screenDetail")?.classList.toggle("active",name==="detail");
  window.scrollTo(0,0);
}

function jsonp(params, timeout=15000){
  return new Promise((resolve,reject)=>{
    if(!configured()) return reject(new Error("APPS_SCRIPT_URL não configurada."));
    const cb="__gas_"+Date.now()+"_"+Math.floor(Math.random()*100000);
    const s=document.createElement("script");
    const t=setTimeout(()=>{cleanup();reject(new Error("Tempo esgotado ao consultar o Apps Script."));},timeout);
    function cleanup(){clearTimeout(t);try{delete window[cb]}catch{};s.remove();}
    window[cb]=p=>{cleanup();resolve(p)};
    const q=new URLSearchParams({...params,callback:cb,_:String(Date.now())});
    s.src=`${APPS_SCRIPT_URL}?${q}`;
    s.onerror=()=>{cleanup();reject(new Error("Não foi possível carregar o Apps Script."));};
    document.head.appendChild(s);
  });
}

async function loadFromSheet({silent=false}={}){
  if(!configured()){ status("Não configurado","offline"); renderApp(); return state; }
  status("Carregando...","busy");
  try{
    const p=await jsonp({action:"read"});
    if(!p?.ok || !p.data) throw new Error(p?.message||"Resposta inválida do Apps Script.");
    state=p.data;
    renderApp();
    if($("#adminModal")?.classList.contains("open")){syncAdminInputs();renderTransactionEditor();}
    status("Sincronizado","online");
    return state;
  }catch(e){
    status("Erro na leitura","offline");
    if(!silent) alert(e.message);
    throw e;
  }
}

function requestId(){
  return crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function waitStatus(id){
  for(let i=0;i<14;i++){
    await sleep(i?550:800);
    const p=await jsonp({action:"status",requestId:id},10000);
    if(p?.found===true) return p;
  }
  throw new Error("A implantação /exec não retornou o status. Publique a nova versão do Apps Script.");
}

async function saveToSheet(){
  const key=$("#adminKeyInput")?.value.trim();
  if(!key) return alert("Digite a senha administrativa.");
  if(!configured()) return alert("Configure APPS_SCRIPT_URL no script.js.");

  const btn=$("#saveSheetBtn"); if(btn) btn.disabled=true;
  status("Salvando...","busy");
  try{
    const id=requestId();
    await fetch(APPS_SCRIPT_URL,{
      method:"POST",mode:"no-cors",cache:"no-store",
      headers:{"Content-Type":"text/plain;charset=UTF-8"},
      body:JSON.stringify({action:"save",requestId:id,adminKey:key,data:state})
    });
    const r=await waitStatus(id);
    if(!r.ok) throw new Error(r.message||"Falha ao salvar.");
    await loadFromSheet({silent:true});
    status("Salvo na planilha","online");
    alert("Alterações salvas na planilha com sucesso.");
  }catch(e){
    status("Erro ao salvar","offline");
    alert("Não foi possível salvar:\n\n"+e.message);
  }finally{ if(btn) btn.disabled=false; }
}

function openAdmin(){
  syncAdminInputs();
  renderTransactionEditor();
  $("#adminModal")?.classList.add("open");
}

function closeAdmin(){
  $("#adminModal")?.classList.remove("open");
}

function syncAdminInputs(){
  if($("#companyInput")) $("#companyInput").value=state.account?.company||"";
  if($("#balanceInput")) $("#balanceInput").value=state.account?.balance||"";
  if($("#blockedInput")) $("#blockedInput").value=state.account?.blocked||"";
  if($("#rescisoryInput")) $("#rescisoryInput").value=state.account?.rescisory||"";
}

function renderTransactionEditor(){
  const root=$("#transactionsEditor");
  if(!root) return;
  root.innerHTML="";
  (state.transactions||[]).forEach((tx,i)=>{
    const d=document.createElement("div");
    d.className="tx-editor";
    d.innerHTML=`<div class="tx-editor-grid">
      <div class="form-field"><label>Mês</label><input data-i="${i}" data-k="month" value="${esc(tx.month)}"></div>
      <div class="form-field"><label>Data</label><input data-i="${i}" data-k="date" value="${esc(tx.date)}"></div>
      <div class="form-field"><label>Histórico</label><input data-i="${i}" data-k="history" value="${esc(tx.history)}"></div>
      <div class="form-field"><label>Descrição</label><input data-i="${i}" data-k="description" value="${esc(tx.description||"")}"></div>
      <div class="form-field"><label>Valor</label><input data-i="${i}" data-k="value" value="${esc(tx.value)}"></div>
      <div class="form-field"><label>Saldo parcial</label><input data-i="${i}" data-k="partialBalance" value="${esc(tx.partialBalance)}"></div>
      </div><button class="danger-btn" type="button" data-remove="${i}">Remover</button>`;
    root.appendChild(d);
  });
  root.querySelectorAll("input[data-i]").forEach(inp=>inp.addEventListener("input",e=>{
    state.transactions[+e.target.dataset.i][e.target.dataset.k]=e.target.value;
    renderTransactions();
  }));
  root.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",e=>{
    state.transactions.splice(+e.currentTarget.dataset.remove,1);
    renderTransactionEditor(); renderTransactions();
  }));
}

function generatePdf(){
  if(!window.jspdf?.jsPDF) return alert("jsPDF não carregou.");
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4"});
  let y=16, left=14;
  doc.setTextColor(225,225,225);doc.setFontSize(30);
  doc.text("",105,145,{align:"center",angle:35});
  doc.setTextColor(16,53,78);doc.setFont("helvetica","bold");doc.setFontSize(20);
  doc.text("FGTS DEMO",left,y); y+=12;
  doc.setTextColor(20,28,36);doc.setFont("helvetica","normal");doc.setFontSize(9.5);
  [`Nome: ${state.worker?.fullName||""}`,`PIS/PASEP: ${state.worker?.pis||""}`,`CTPS: ${state.worker?.ctps||""}`,
   `Empregador: ${state.account?.company||""}`,`Saldo: ${brl(state.account?.balance)}`,`Saldo bloqueado: ${brl(state.account?.blocked)}`]
   .forEach(t=>{doc.text(t,left,y);y+=5;});
  y+=5;
  (state.transactions||[]).forEach(tx=>{
    if(y>275){doc.addPage();y=18;}
    doc.text(doc.splitTextToSize(`${tx.date} ${tx.month} ${tx.history} ${tx.value} ${tx.partialBalance}`,180),left,y);y+=7;
  });
  doc.setTextColor(160,54,44);doc.setFont("helvetica","bold");
  doc.text("",left,Math.min(y+5,285));
  doc.save("extrato-fgts.pdf");
}

function bindEvents(){
  $("#accountCard")?.addEventListener("click",()=>showScreen("detail"));
  $("#backBtn")?.addEventListener("click",()=>showScreen("home"));
  $("#syncBtn")?.addEventListener("click",()=>loadFromSheet().catch(()=>{}));
  $("#editFab")?.addEventListener("click",openAdmin);
  $("#closeModalBtn")?.addEventListener("click",closeAdmin);
  $("#adminModal")?.addEventListener("click",e=>{if(e.target.id==="adminModal")closeAdmin();});

  $("#companyInput")?.addEventListener("input",()=>{state.account.company=$("#companyInput").value;renderApp();});
  $("#balanceInput")?.addEventListener("input",()=>{state.account.balance=$("#balanceInput").value;renderApp();});
  $("#blockedInput")?.addEventListener("input",()=>{state.account.blocked=$("#blockedInput").value;renderApp();});
  $("#rescisoryInput")?.addEventListener("input",()=>{state.account.rescisory=$("#rescisoryInput").value;renderApp();});

  $("#addTransactionBtn")?.addEventListener("click",()=>{
    state.transactions.push({month:"Agosto/2026",date:"01/08",history:"LANÇAMENTO",description:"Descrição",value:"R$ 0,00",partialBalance:brl(state.account.balance)});
    renderTransactionEditor();renderTransactions();
  });

  $("#reloadSheetBtn")?.addEventListener("click",()=>loadFromSheet().catch(()=>{}));
  $("#saveSheetBtn")?.addEventListener("click",saveToSheet);
  $("#resetBtn")?.addEventListener("click",()=>{state=structuredClone(mockSheetData);syncAdminInputs();renderTransactionEditor();renderApp();});
  $("#pdfBtn")?.addEventListener("click",generatePdf);
}

document.addEventListener("DOMContentLoaded",async()=>{
  bindEvents();
  renderApp();
  console.log("FGTS Demo carregado: eventos ativos.");
  if(configured()) loadFromSheet({silent:true}).catch(console.error);
  else status("Não configurado","offline");

  if(AUTO_REFRESH_MS>0){
    setInterval(()=>{
      if(configured() && !$("#adminModal")?.classList.contains("open")){
        loadFromSheet({silent:true}).catch(console.error);
      }
    },AUTO_REFRESH_MS);
  }
});
