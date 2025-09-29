// /app/despesas/js/firebase.js
// Reusa o app/auth global e adiciona helpers locais (onAuthUser, getGoogleAccessToken)

import { app as rootApp, auth as rootAuth } from '/js/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// re-export para quem precisar
export const app  = rootApp;
export const auth = rootAuth;

/* =============== Auth subscribers (mostrar usuário, etc.) =============== */
let _user = null;
const _subs = new Set();

onAuthStateChanged(auth, (u) => {
  _user = u || null;
  _subs.forEach(fn => { try { fn(_user); } catch {} });
});

export function onAuthUser(cb){
  if (typeof cb === 'function') {
    _subs.add(cb);
    // chama imediatamente com o estado atual
    try { cb(_user); } catch {}
    return ()=>_subs.delete(cb);
  }
  return ()=>{};
}

export function currentUser(){ return _user; }

/* =============== Google OAuth (Drive) via GSI =============== */
// Coloque aqui o CLIENT_ID do OAuth que você me passou:
const GOOGLE_OAUTH_CLIENT_ID = "329806123621-p2ttq9g7th9fdul74u6t7gntla0q2gcm.apps.googleusercontent.com";

/** Solicita um access_token para o escopo desejado (ex.: https://www.googleapis.com/auth/drive.file) */
export function getGoogleAccessToken(scope) {
  return new Promise((resolve, reject) => {
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      return reject(new Error('Google OAuth não disponível'));
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scope,
      callback: (resp) => {
        if (resp && resp.access_token) resolve(resp.access_token);
        else reject(new Error('Falha ao obter token OAuth'));
      }
    });
    client.requestAccessToken();
  });
}