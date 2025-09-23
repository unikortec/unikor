// js/firebase.js (versão mínima — temporária)
// Usa custom token (se fornecido por Unikor) ou faz sign-in anônimo como fallback.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyC12s4PvUWtNxOlShPc7zXlzq4XWqlVo2w",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.appspot.com",
  messagingSenderId: "329806123621",
  appId: "1:329806123621:web:9aeff2f5947cd106cf2c8c",
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Tenta usar token custom (injetado via shell Unikor), senão faz auth anônimo.
// Quando a Unikor estiver pronta, basta passar window.UNIKOR_CUSTOM_TOKEN e desabilitar Anonymous no Console.
async function ensureAuth() {
  try {
    if (window.UNIKOR_CUSTOM_TOKEN) {
      await signInWithCustomToken(auth, window.UNIKOR_CUSTOM_TOKEN);
      return;
    }
  } catch (e) { console.warn("[Auth] custom token falhou, usando anônimo:", e?.message || e); }

  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.error("[Auth] anônimo falhou:", e?.message || e);
  }
}

// Promise que o app usa para aguardar login
export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (u) => { if (u) resolve(u); });
  ensureAuth();
});

// IndexedDB persistence (best-effort)
try { await enableIndexedDbPersistence(db); } catch (e) { /* ignora se não suportado */ }