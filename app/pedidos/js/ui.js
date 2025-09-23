export function toast(msg, cls="") {
  const box = document.getElementById('toastBox');
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
export const toastOk = (m)=>toast(m,"ok");
export const toastWarn = (m)=>toast(m,"warn");
export const toastErro = (m)=>toast(m,"err");

export function setFormEnabled(enabled){
  const app = document.getElementById('appMain');
  if (!enabled){ app.classList.add('app-disabled'); }
  else { app.classList.remove('app-disabled'); }
}