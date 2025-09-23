// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// ⚙️ Config do projeto Unikor (inalterado)
export const firebaseConfig = {
  apiKey: "AIzaSyC12s4PvUWtNxOlShPc7zXlzq4XWqlVo2w",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.appspot.com",
  messagingSenderId: "329806123621",
  appId: "1:329806123621:web:9aeff2f5947cd106cf2c8c",
};

// 🔸 Tenant que vamos usar agora (também quando migrarmos pro login, continua o mesmo caminho)
export const TENANT_ID = "serranobrecarnes.com.br";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 🔐 anônimo (temporário)
export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) resolve(user);
    else signInAnonymously(auth).then(resolve).catch((e) => {
      console.warn("Anon auth falhou:", e?.message || e);
      resolve(null);
    });
  });
});

export const db = getFirestore(app);

// 🌐 cache offline (best-effort)
try { await enableIndexedDbPersistence(db); } catch (_) {}