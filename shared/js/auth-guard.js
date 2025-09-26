// /shared/js/auth-guard.js
import { auth } from '/js/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// Aguardar autenticação antes de liberar a página
function waitForAuth() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
}

// Verificar autenticação ao carregar a página
document.addEventListener('DOMContentLoaded', async () => {
    const user = await waitForAuth();
    
    if (!user || user.isAnonymous) {
        // Salvar a URL atual para redirect após login
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== '/') {
            sessionStorage.setItem('redirectAfterLogin', currentPath);
        }
        // Redirecionar para o portal
        window.location.href = '/';
        return;
    }
    
    // Usuário está logado, pode continuar
    console.log('Usuário autenticado:', user.email);
});
