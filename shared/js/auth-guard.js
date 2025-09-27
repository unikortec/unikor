// Auth Guard resiliente para múltiplos apps (sem loop e sem anônimo)
let firebaseMod = null;

async function loadFirebase() {
  if (firebaseMod) return firebaseMod;
  try {
    // Caminho padrão compartilhado (se existir)
    firebaseMod = await import('/js/firebase.js');
  } catch {
    // Fallback para o app de pedidos
    firebaseMod = await import('/app/pedidos/js/firebase.js');
  }
  return firebaseMod;
}

async function getUser() {
  const { auth } = await loadFirebase();
  return new Promise((resolve) => {
    // import dinâmico do onAuthStateChanged (evita duplicidade)
    import("https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js")
      .then(({ onAuthStateChanged }) => {
        const unsub = onAuthStateChanged(auth, (user) => {
          unsub(); resolve(user);
        });
      });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Evita redireciono em loop
  if (sessionStorage.getItem('authGuardRedirecting') === '1') return;

  const user = await getUser();

  if (!user || user.isAnonymous) {
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== '/') {
      sessionStorage.setItem('redirectAfterLogin', currentPath);
    }
    sessionStorage.setItem('authGuardRedirecting', '1');
    window.location.replace('/');
    return;
  }

  sessionStorage.removeItem('authGuardRedirecting');
  console.log('Usuário autenticado:', user.email);
});
