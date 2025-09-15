// js/firebase.js
// Configuração Firebase (CDN ESM) para UNIKOR Portal

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getAnalytics, isSupported } 
                        from "https://www.gstatic.com/firebasejs/12.2.1/firebase-analytics.js";

// Configuração do projeto UNIKOR (corrigido)
export const firebaseConfig = {
  apiKey: "AIzaSyC12s4PvUWtNxOlShPc7zXlzq4XWqlVo2w",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.appspot.com",   // <- ajuste aqui
  messagingSenderId: "329806123621",
  appId: "1:329806123621:web:9aeff2f5947cd106cf2c8c",
  measurementId: "G-WLVX3YK3EN"
};

// Inicializa Firebase
export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Analytics (só se suportado no navegador)
isSupported().then((ok) => {
  if (ok) getAnalytics(app);
}).catch(()=>{});
