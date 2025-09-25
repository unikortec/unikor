// app/pedidos/js/firebase.js
// Firestore + auth anônima, exportando um Firestore REAL (não-Promise).

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* CONFIG DO PROJETO */
const firebaseConfig = {
  apiKey:        "AIzaSyD-XXXXX_SUBSTITUA_AQUI",
  authDomain:    "unikorapp.firebaseapp.com",
  projectId:     "unikorapp",
  storageBucket: "unikorapp.appspot.com",
  appId:         "1:1234567890:web:abcdef"
};

// Inicia app e Firestore (db é um Firestore OBJETO)
export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

// Auth anônima + sinalização de pronto
const auth = getAuth(app);
export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, () => resolve(true));
});
signInAnonymously(auth).catch(()=>{ /* silencioso */ });

// Tenant fixo (Serra Nobre) enquanto o módulo roda isolado
export const TENANT_ID = "serranobrecarnes.com.br";

// Persistência offline (opcional; ignora erro se não suportar)
enableIndexedDbPersistence(db).catch(()=>{});