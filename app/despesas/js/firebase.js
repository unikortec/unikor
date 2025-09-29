// app/despesas/js/firebase.js
// Proxy + helpers locais de auth para este app

export { app, auth } from '/js/firebase.js';
import { auth as rootAuth } from '/js/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

export function onAuthUser(cb){
  if (typeof cb !== 'function') return ()=>{};
  const unsub = onAuthStateChanged(rootAuth, cb);
  return unsub;
}