// /shared/js/auth-guard.js
import { onAuthUser, waitForLogin, getCurrentUser } from '/portal/app/pedidos/js/firebase.js';

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

// Observa auth continuamente
onAuthUser(async (user) => {
  if (!user) {
    // sem login → manda para o portal e impede voltar
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== '/') {
      sessionStorage.setItem('redirectAfterLogin', currentPath);
    }
    // reforço: se ainda estamos dentro do app, sai para o portal
    if (!/^(\/|\/portal\/?)$/.test(window.location.pathname)) {
      location.replace('/'); // não deixa voltar
    }
    return;
  }

  // logado → mostra app
  showApp();

  // redirect pós login (se veio do portal)
  const redirect = sessionStorage.getItem('redirectAfterLogin');
  if (redirect && redirect !== window.location.pathname) {
    sessionStorage.removeItem('redirectAfterLogin');
    location.replace(redirect);
  }
});

// Caso o guard carregue já logado, libera imediatamente
if (getCurrentUser()) showApp();
else {
  // Se alguém logar depois, waitForLogin libera
  waitForLogin().then(showApp).catch(()=>{});
}
