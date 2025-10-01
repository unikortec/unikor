// relatorios/js/firebase.js
import { app as rootApp, auth as rootAuth, db as rootDb, onAuthUser as rootOnAuthUser, waitForLogin as rootWait, getCurrentUser as rootGetUser } from '/js/firebase.js';
import { getIdTokenResult } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export const app  = rootApp;
export const auth = rootAuth;
export const db   = rootDb;

// reexports firestore helpers
export {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
};

// bus de auth (mesmo do portal)
export const onAuthUser   = rootOnAuthUser;
export const waitForLogin = rootWait;
export const getCurrentUser = rootGetUser;

/** Garante tenantId/role via claims do usuário logado no portal. */
export async function requireTenantContext() {
  const user = rootGetUser();
  if (!user) {
    const u = await rootWait();
    const tr = await u.getIdTokenResult(true);
    const tenantId = tr.claims?.tenantId || "";
    const role = tr.claims?.role || "";
    if (!tenantId) throw new Error("Sem tenantId nos claims.");
    return { user: u, tenantId, role };
  }
  const tok = await getIdTokenResult(user, true);
  const tenantId = tok.claims?.tenantId || "";
  const role = tok.claims?.role || "";
  if (!tenantId) throw new Error("Sem tenantId nos claims.");
  return { user, tenantId, role };
}