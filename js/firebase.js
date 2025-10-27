// /js/firebase.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, enableIndexedDbPersistence,
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

// ============== CONFIG =================
export const firebaseConfig = {
  apiKey: "AIzaSyC12s4PvUWtNxOlShPc7zXlzq4XWqlVo2w",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.firebasestorage.app", // <<< bucket certo
  messagingSenderId: "329806123621",
  appId: "1:329806123621:web:9aeff2f5947cd106cf2c8c",
};

// ============== INIT ===================
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export { app };
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const storage = getStorage(app);

// ============== Firestore offline ======
enableIndexedDbPersistence(db, { synchronizeTabs: true })
  .then(() => console.log("[Firestore] Persistência offline habilitada."))
  .catch((e) => console.warn("[Firestore] Offline indisponível:", e?.message || e));

// ============== Auth bus ===============
let currentUser = null;
const subs = new Set();
const pendingLoginWaiters = new Set();

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  console.log("[Firebase Auth]", currentUser ? `Logado: ${currentUser.email || currentUser.uid}` : "Não logado");

  subs.forEach(fn => { try { fn(currentUser); } catch {} });
  if (currentUser) {
    pendingLoginWaiters.forEach(res => res(currentUser));
    pendingLoginWaiters.clear();
  }
});

export function onAuthUser(cb){ if (typeof cb==='function'){ subs.add(cb); try{cb(currentUser);}catch{} return ()=>subs.delete(cb);} return ()=>{}; }
export function getCurrentUser(){ return currentUser; }
export function isLoggedIn(){ return !!currentUser; }
export function waitForLogin(){ return currentUser ? Promise.resolve(currentUser) : new Promise(r=>pendingLoginWaiters.add(r)); }

// Reexports Firestore (compat com outros apps)
export {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";