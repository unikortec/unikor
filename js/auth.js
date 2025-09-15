// js/auth.js
// Autenticação Firebase (v12.2.1 ESM)

import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
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
