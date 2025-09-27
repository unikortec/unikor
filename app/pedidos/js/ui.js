// app/pedidos/js/ui.js
export function toast(msg, cls = "") {
  const box = document.getElementById('toastBox');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
export const toastOk = (m) => toast(m, "ok");
export const toastWarn = (m) => toast(m, "warn");
export const toastErro = (m) => toast(m, "err");

export function setFormEnabled(enabled) {
  const app = document.getElementById('appMain');
  if (!app) return;
  if (!enabled) { app.classList.add('app-disabled'); }
  else { app.classList.remove('app-disabled'); }
}

// ===== Overlay (spinner) =====
export function showOverlay() {
  const ov = document.getElementById('appOverlay');
  if (!ov) return;
  ov.classList.remove('hidden');
}
export function hideOverlay() {
  const ov = document.getElementById('appOverlay');
  if (!ov) return;
  ov.classList.add('hidden');
}