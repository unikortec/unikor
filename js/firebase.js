// js/firebase.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// =================== CONFIG ===================
export const firebaseConfig = {
  apiKey: "AIzaSyC12s4PvUWtNxOlShPc7zXlzq4XWqlVo2w",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.appspot.com",
  messagingSenderId: "329806123621",
  appId: "1:329806123621:web:9aeff2f5947cd106cf2c8c",
};

// =================== INIT ===================
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db   = getFirestore(app);

// =================== AUTH STATE BUS ===================
let currentUser = null;
const subs = new Set();
const pendingLoginWaiters = new Set();

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  console.log("[Firebase Auth]", currentUser ? `Logado: ${currentUser.email}` : "Não logado");

  // notifica subscribers
  subs.forEach(fn => { try { fn(currentUser); } catch {} });

  // resolve quem estava esperando login
  if (currentUser) {
    pendingLoginWaiters.forEach(res => res(currentUser));
    pendingLoginWaiters.clear();
  }
});

// =================== HELPERS ===================
export function onAuthUser(cb) {
  if (typeof cb === 'function') {
    subs.add(cb);
    cb(currentUser);
    return () => subs.delete(cb);
  }
  return () => {};
}

export function getCurrentUser() {
  return currentUser;
}

export function isLoggedIn() {
  return !!currentUser;
}

export function waitForLogin() {
  if (currentUser) return Promise.resolve(currentUser);
  return new Promise((resolve) => pendingLoginWaiters.add(resolve));
}

// Reexport Firestore helpers (facilita nos módulos)
export {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
};