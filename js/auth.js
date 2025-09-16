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

// Retorna o usuário atual logado no Firebase
export async function getCurrentUser() {
  return auth.currentUser;
}

// Obtém access_token Google com escopo extra (ex.: Drive)
export async function getAccessToken(scope = "https://www.googleapis.com/auth/drive.file") {
  const user = auth.currentUser;
  if (!user) throw new Error("Nenhum usuário logado");

  const provider = new GoogleAuthProvider();
  provider.addScope(scope);

  try {
    // Tenta vincular conta Google ao usuário atual
    const result = await linkWithPopup(user, provider);
    return result.credential.accessToken;
  } catch (err) {
    // Se já está vinculado, faz reauth para renovar token
    const result = await reauthenticateWithPopup(user, provider);
    return result.credential.accessToken;
  }
}

// Expõe no escopo global para consumo dos PWAs
window.UNIKOR_AUTH = {
  getCurrentUser,
  getAccessToken
};