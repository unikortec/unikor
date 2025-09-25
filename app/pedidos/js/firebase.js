// app/pedidos/js/firebase.js
// Firestore + auth anônima (tenant Serra Nobre) para rodar o módulo isolado.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* CONFIG DO PROJETO (seu print) */
const firebaseConfig = {
  apiKey: "AIzaSyC12s4PvUWtNxOlShPc7zXlzq4XWqlVo2w",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.firebasestorage.app",
  messagingSenderId: "329806123621",
  appId: "1:329806123621:web:9aeff2f5947cd106cf2c8c",
  measurementId: "G-WLXV3YK3EN"
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);

// Resolve quando tiver um usuário (se não tiver, entra anônimo)
export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (u) => resolve(!!u));
});
signInAnonymously(auth).catch(()=>{ /* silencioso */ });

// Tenant fixo durante o piloto isolado
export const TENANT_ID = "serranobrecarnes.com.br";

// Offline
enableIndexedDbPersistence(db).catch(()=>{});