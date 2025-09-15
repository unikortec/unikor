// js/guard.js
import { auth } from "./firebase.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

export function requireAuth({ roles = null, onReady }) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }

    let token, role = "geral";
    try {
      token = await user.getIdTokenResult(true);
      role  = token?.claims?.role || "geral";
    } catch {
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

