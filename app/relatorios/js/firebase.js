// relatorios/js/firebase.js
import {
  app as rootApp, auth as rootAuth, db as rootDb,
  onAuthUser as rootOnAuthUser, waitForLogin as rootWait
} from '/js/firebase.js';

import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp,
  startAt, endAt
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export const app = rootApp;
export const auth = rootAuth;
export const db   = rootDb;

// Encaminha eventos de auth e helpers da raiz
export const onAuthUser  = rootOnAuthUser;
export const waitForLogin = rootWait;

// Obtém claims (tenantId/role) garantindo que existam
export async function requireTenantContext() {
  const user = auth.currentUser || (await rootWait());
  const token = user.getIdToken ? await user.getIdToken(/*force*/true) : null; // aquece
  const { claims } = await user.getIdTokenResult(true);
  const tenantId = claims?.tenantId || "";
  const role = claims?.role || "";
  if (!tenantId) throw new Error("Sem tenantId nas claims. Verifique o provisionamento do usuário.");
  return { user, tenantId, role };
}

// Reexports Firestore (facilita nos módulos)
export {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp,
  startAt, endAt
};