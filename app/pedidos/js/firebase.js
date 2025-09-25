// app/pedidos/js/firebase.js
// Firestore + auth anônima (tenant fixo Serra Nobre)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* CONFIG DO PROJETO - MESMO DO PORTAL */
export const firebaseConfig = {
  apiKey: "AIzaSyC12s4PvUWtNxOlShPc7zXlzq4XWqlVo2w",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.appspot.com",
  messagingSenderId: "329806123621",
  appId: "1:329806123621:web:9aeff2f5947cd106cf2c8c"
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

// Auth anônima
const auth = getAuth(app);
export const authReady = new Promise((resolve) => onAuthStateChanged(auth, () => resolve(true)));
signInAnonymously(auth).catch(()=>{});

// Tenant fixo (rodando isolado)
export const TENANT_ID = "serranobrecarnes.com.br";

// Persistência offline
enableIndexedDbPersistence(db).catch(()=>{});