// js/guard.js
// Guard de rota baseado em Firebase Auth (v12.2.1 ESM)

import { auth } from "./firebase.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

/* ===== Helpers de claims/tenant ===== */
export async function getClaims(force = false) {
  const u = auth.currentUser;
  if (!u) return {};
  const tok = await u.getIdTokenResult(force);
  return tok?.claims || {};
}

// HOJE: tenant fixo "unikor". (Futuro: virá de claims/e-mail do usuário)
export async function getTenantId() {
  const claims = await getClaims(true);
  return claims.tenantId || "unikor";
}

let __tenantCache = null;
export async function ensureTenant() {
  if (!__tenantCache) __tenantCache = await getTenantId();
  return __tenantCache;
}
/* ==================================== */

/**
 * Protege páginas que exigem login/autorização.
 * Ex.: requireAuth({ roles: ["master","gerente"], onReady: ({user,role,token})=>{} })
 */
export function requireAuth({ roles = null, onReady }) {
  onAuthStateChanged(auth, async (user) => {
    // não logado → volta ao portal (ajuste o caminho se necessário)
    if (!user) {
      window.location.href = "/portal/index.html";
      return;
    }

    let token, role = "geral";
    try {
      token = await user.getIdTokenResult(true);
      role  = token?.claims?.role || "geral";
    } catch (err) {
      console.error("Erro ao obter claims:", err);
      window.location.href = "/portal/index.html";
      return;
    }

    if (Array.isArray(roles) && roles.length && !roles.includes(role)) {
      alert("Acesso negado para este perfil.");
      window.location.href = "/portal/index.html";
      return;
    }

    onReady?.({ user, role, token });
  });
}
// Retorna tenantId do token; se ausente, usa domínio do e-mail (ex.: unikor.com.br → "unikor")
export async function getTenantIdFrom(userOrNull) {
  const user = userOrNull;
  if (!user) return "unikor"; // fallback seguro

  try {
    const token = await user.getIdTokenResult(true);
    if (token?.claims?.tenantId) return token.claims.tenantId;
  } catch {}

  // fallback por domínio
  const email = user.email || "";
  const domain = email.split("@")[1] || "";
  const tenant = (domain.split(".")[0] || "unikor").toLowerCase().replace(/[^a-z0-9_-]/g,"");
  return tenant || "unikor";
}