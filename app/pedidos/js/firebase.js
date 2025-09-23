// portal/app/pedidos/js/firebase.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged }    from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence }
  from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/**
 * ⚙️ Config Firebase Unikor
 * - Reusa config do portal se exposta em window.UNIKOR.firebaseConfig
 * - Caso contrário, usa a config padrão do projeto unikorapp
 */
export const firebaseConfig = window.UNIKOR?.firebaseConfig || {
  apiKey: "AIzaSyC12s4PvUWtNxOlShPc7zXlzq4XWqlVo2w",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.appspot.com",
  messagingSenderId: "329806123621",
  appId: "1:329806123621:web:9aeff2f5947cd106cf2c8c"
};

/**
 * ✅ Reutiliza a instância já criada pelo portal (evita múltiplos inits)
 */
export const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

/**
 * 🔐 Sem login anônimo:
 * - Esse Promise só RESOLVE quando houver um usuário autenticado no portal.
 * - Não rejeita: apenas espera até o login acontecer (evita crash silencioso nos módulos).
 */
export const authReady = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    if (user) { unsub(); resolve(user); }
    // Se não houver user, fica aguardando o login do portal.
  });
});

/**
 * 🌐 Cache offline do Firestore (best-effort)
 */
try { await enableIndexedDbPersistence(db); } catch (_) {}