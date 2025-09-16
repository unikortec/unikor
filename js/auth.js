// js/auth.js
// Autenticação Firebase (v12.2.1 ESM)

import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// Atalho para querySelector
export const $ = (s) => document.querySelector(s);

// Listener de usuário logado/deslogado
export function onUser(cb) {
  return onAuthStateChanged(auth, cb);
}

// Login com e-mail/senha
export async function doLogin(email, pass) {
  return signInWithEmailAndPassword(auth, email, pass);
}

// Reset de senha por e-mail
export async function doReset(email) {
  return sendPasswordResetEmail(auth, email);
}

// Logout
export async function doLogout() {
  return signOut(auth);
}

// =======================================================
// Novos utilitários para PWAs (Despesas, etc.)
// =======================================================

// Retorna (ou aguarda) o usuário atual logado no Firebase
export async function getCurrentUser() {
  if (auth.currentUser) return auth.currentUser;
  // aguarda o primeiro evento do onAuthStateChanged
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u || null); });
  });
}

// Obtém access_token Google com escopo extra (ex.: Drive)
export async function getAccessToken(scope = "https://www.googleapis.com/auth/drive.file") {
  const user = await getCurrentUser();
  if (!user) throw new Error("Nenhum usuário logado");

  const provider = new GoogleAuthProvider();
  provider.addScope(scope);

  // 1) Tenta reautenticar (caso já esteja linkado ao Google)
  try {
    const result = await reauthenticateWithPopup(user, provider);
    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (!cred?.accessToken) throw new Error("Sem accessToken no resultado (reauth)");
    return cred.accessToken;
  } catch (e) {
    // 2) Se não estiver linkado ao Google, faz o link
    const result = await linkWithPopup(user, provider);
    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (!cred?.accessToken) throw new Error("Sem accessToken no resultado (link)");
    return cred.accessToken;
  }
}

// Expõe no escopo global para consumo dos PWAs
window.UNIKOR_AUTH = {
  getCurrentUser,
  getAccessToken
};
