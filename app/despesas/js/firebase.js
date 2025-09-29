// app/despesas/js/firebase.js
export * from '/js/firebase.js'; // exporta { app, auth } da raiz

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { auth } from '/js/firebase.js';

/** Observa o usuário logado (retorna unsubscribe) */
export function onAuthUser(cb){
  return onAuthStateChanged(auth, (u)=>cb && cb(u));
}