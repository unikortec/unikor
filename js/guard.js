// js/guard.js
// Guard de rota baseado em Firebase Auth (v12.2.1 ESM)

import { auth } from "./firebase.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

/**
 * Uso:
 * requireAuth({
 *   roles: ["master", "gerente"],            // opcional (verifica custom claim "role")
 *   onReady: ({ user, role, token }) => { ... }
 * });
 */
export function requireAuth({ roles = null, onReady }) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }

    let token, role = "geral";
    try {
      token = await user.getIdTokenResult(true);
      role  = token?.claims?.role || "geral";
    } catch {
      // se falhar obter claims, força re-login
      window.location.href = "index.html";
      return;
    }

    if (Array.isArray(roles) && roles.length && !roles.includes(role)) {
      alert("Acesso negado para este perfil.");
      window.location.href = "index.html";
      return;
    }

    onReady?.({ user, role, token });
  });
}
