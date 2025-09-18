// Firebase UNIKOR (12.2.1)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

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

let __authed=false;
export async function ensureAnonAuth(){
  if (__authed) return;
  await new Promise((resolve)=>{
    onAuthStateChanged(auth, async (u)=>{
      try{ if (!u) await signInAnonymously(auth); }catch(_){}
      __authed=true; resolve();
    }, async ()=>{ try{ await signInAnonymously(auth); }catch(_){}
      __authed=true; resolve();
    });
  });
}
