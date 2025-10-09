/**
 * Exibe uma mensagem "toast" temporária na tela.
 * @param {string} msg A mensagem a ser exibida.
 * @param {string} [cls=""] Uma classe CSS adicional (ex: "ok", "warn", "err").
 */
export function toast(msg, cls = "") {
  const box = document.getElementById('toastBox');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/** Exibe um toast de sucesso. */
export const toastOk = (m) => toast(m, "ok");
/** Exibe um toast de aviso. */
export const toastWarn = (m) => toast(m, "warn");
/** Exibe um toast de erro. */
export const toastErro = (m) => toast(m, "err");

/**
 * Habilita ou desabilita os inputs do formulário principal.
 * @param {boolean} enabled `true` para habilitar, `false` para desabilitar.
 */
export function setFormEnabled(enabled) {
  const app = document.getElementById('appMain');
  if (!app) return;
  // Usar toggle é mais conciso que if/else com add/remove
  app.classList.toggle('app-disabled', !enabled);
}

// ===== Overlay (spinner) =====

/** Exibe o overlay de carregamento (spinner). */
export function showOverlay() {
  const ov = document.getElementById('appOverlay');
  if (ov) {
    ov.classList.remove('hidden');
  }
}

/** Oculta o overlay de carregamento (spinner). */
export function hideOverlay() {
  const ov = document.getElementById('appOverlay');
  if (ov) {
    ov.classList.add('hidden');
  }
}
