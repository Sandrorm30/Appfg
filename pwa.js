let deferredInstallPrompt = null;

window.addEventListener("load", async () => {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
      console.info("PWA: Service Worker registrado.");
    } catch (error) {
      console.error("PWA: erro ao registrar Service Worker:", error);
    }
  }
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const btn = document.querySelector("#installPwaBtn");
  if (btn) btn.hidden = false;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const btn = document.querySelector("#installPwaBtn");
  if (btn) btn.hidden = true;
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#installPwaBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      alert("Use o menu do navegador e escolha 'Instalar app' ou 'Adicionar à tela inicial'.");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    btn.hidden = true;
  });
});
