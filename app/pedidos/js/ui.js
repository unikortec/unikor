function ensureToastBox() {
  if (!document.getElementById('toastBox')) {
    const box = document.createElement('div');
    box.id = 'toastBox';
    box.className = 'toast-box';
    document.body.appendChild(box);
  }
}
ensureToastBox();

export function toast(msg, cls = "") {
  ensureToastBox();
  const box = document.getElementById('toastBox');
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
export const toastOk   = (m) => toast(m, "ok");
export const toastWarn = (m) => toast(m, "warn");
export const toastErro = (m) => toast(m, "err");

export function setFormEnabled(enabled) {
  const app = document.getElementById('appMain');
  if (!app) return;
  if (!enabled) app.classList.add('app-disabled');
  else app.classList.remove('app-disabled');
}

// overlay simples para operações longas (opcional)
export function showLoading() {
  const ov = document.getElementById('appOverlay');
  if (ov) ov.classList.remove('hidden');
  setFormEnabled(false);
}
export function hideLoading() {
  const ov = document.getElementById('appOverlay');
  if (ov) ov.classList.add('hidden');
  setFormEnabled(true);
}
