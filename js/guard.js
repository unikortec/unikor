// js/guard.js
// Guard de rota baseado em Firebase Auth (v12.2.1 ESM)

import { auth } from "./firebase.js";
import { onAuthStateChanged } 
  from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

/**
 * Protege páginas que exigem login/autorização.
 * 
 * Exemplo de uso:
 * requireAuth({
 *   roles: ["master", "gerente"],   // opcional: restringe a claims específicas
 *   onReady: ({ user, role, token }) => {
 *     console.log("Usuário autenticado:", user.email, "Role:", role);
 *   }
 * });
 */
export function requireAuth({ roles = null, onReady }) {
  onAuthStateChanged(auth, async (user) => {
    // Se não estiver logado → volta para login
    if (!user) { 
      window.location.href = "index.html"; 
      return; 
    }

    let token, role = "geral";
    try {
      token = await user.getIdTokenResult(true);
      role  = token?.claims?.role || "geral";
    } catch (err) {
      console.error("Erro ao obter claims:", err);
      window.location.href = "index.html";
      return;
    }

    // Se houver restrição de roles e usuário não for aceito
    if (Array.isArray(roles) && roles.length && !roles.includes(role)) {
      alert("Acesso negado para este perfil.");
      window.location.href = "index.html";
      return;
    }

    // Callback de sucesso
    onReady?.({ user, role, token });
  });
}
