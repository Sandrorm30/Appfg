const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySLvK8VVHHVAWopIIRT0L5RoabFAQDbeTeXWU0-Opnr8GPYKP8iLH37l1r4iFY_3IzHQ/exec";

function jsonp(params, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const callbackName = "__gas_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    const script = document.createElement("script");

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Tempo esgotado ao consultar o Apps Script."));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[callbackName]; } catch {}
      script.remove();
    }

    window[callbackName] = payload => {
      cleanup();
      resolve(payload);
    };

    const qs = new URLSearchParams({
      ...params,
      callback: callbackName,
      _: String(Date.now())
    });

    script.src = `${APPS_SCRIPT_URL}?${qs.toString()}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("Não foi possível carregar o Apps Script."));
    };

    document.head.appendChild(script);
  });
}

async function loadFromSheet() {
  const payload = await jsonp({ action: "read" });

  if (!payload || payload.ok !== true || !payload.data) {
    throw new Error(payload?.message || "Resposta inválida do Apps Script.");
  }

  state = payload.data;
  renderApp();

  if (document.querySelector("#adminModal")?.classList.contains("open")) {
    syncAdminInputs();
    renderTransactionEditor();
  }

  setSyncStatus("Sincronizado", "online");
  return state;
}

async function saveToSheet() {
  const adminKey = document.querySelector("#adminKeyInput").value.trim();

  if (!adminKey) {
    alert("Digite a senha administrativa.");
    return;
  }

  const requestId = crypto.randomUUID
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  setSyncStatus("Salvando...", "busy");
  document.querySelector("#saveSheetBtn").disabled = true;

  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      cache: "no-store",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: JSON.stringify({
        action: "save",
        requestId,
        adminKey,
        data: state
      })
    });

    const result = await waitForSaveStatus(requestId);

    if (result.ok !== true) {
      setSyncStatus("Erro ao salvar", "offline");
      alert("Não foi possível salvar:\n\n" + (result.message || "Erro desconhecido."));
      return;
    }

    setSyncStatus("Salvo na planilha", "online");
    await loadFromSheet();
    alert("Alterações salvas na planilha com sucesso.");

  } catch (err) {
    console.error(err);
    setSyncStatus("Erro ao salvar", "offline");
    alert(err.message);
  } finally {
    document.querySelector("#saveSheetBtn").disabled = false;
  }
}

async function waitForSaveStatus(requestId) {
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, i === 0 ? 700 : 500));

    const payload = await jsonp({
      action: "status",
      requestId
    }, 10000);

    if (payload?.found === true) {
      return payload;
    }
  }

  throw new Error(
    "O Apps Script não retornou o resultado do salvamento. " +
    "Verifique se a implantação usa a versão nova do código."
  );
}
