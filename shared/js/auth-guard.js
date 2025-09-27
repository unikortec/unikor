// /shared/js/auth-guard.js
import { authReady, onAuthUser, getCurrentUser, waitForLogin } from '/app/pedidos/js/firebase.js';

/** Esconde UI até confirmar login */
function hideApp() {
  const app = document.getElementById('appMain');
  if (app) app.style.visibility = 'hidden';
  const off = document.getElementById('offlineBanner');
  if (off) off.style.display = 'none';
}
function showApp() {
  const app = document.getElementById('appMain');
  if (app) app.style.visibility = 'visible';
}

hideApp();

// Fluxo: espere o Firebase inicializar (primeiro estado válido), só então decida
(async () => {
  const firstUser = await authReady; // <-- só resolve após 1º onAuthStateChanged
  if (!firstUser) {
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== '/') sessionStorage.setItem('redirectAfterLogin', currentPath);
    if (window.location.pathname !== '/') location.replace('/');
    return;
  }

  // logado -> libera
  showApp();

  // redirect pós login (se veio do portal)
  const redirect = sessionStorage.getItem('redirectAfterLogin');
  if (redirect && redirect !== window.location.pathname) {
    sessionStorage.removeItem('redirectAfterLogin');
    location.replace(redirect);
  }

  // Observa mudanças FUTURAS (logout, etc.)
  onAuthUser((user) => {
    if (!user) {
      const cp = window.location.pathname + window.location.search;
      if (cp !== '/') sessionStorage.setItem('redirectAfterLogin', cp);
      if (window.location.pathname !== '/') location.replace('/');
    }
  });
})();
