// Firebase (multi-tenant + auditoria + Storage uploads)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, getIdTokenResult } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, serverTimestamp, collection, addDoc, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "SEU_API_KEY",
  authDomain: "SEU_PROJECT.firebaseapp.com",
  projectId: "SEU_PROJECT",
  storageBucket: "SEU_PROJECT.appspot.com",
  appId: "SEU_APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// claims/tenant
let _claims = { tenantId: "default", role: "" };
export function tenantId(){ return _claims.tenantId || "default"; }
export function userRole(){ return _claims.role || ""; }

// auditoria
export const metaCreate = (uid)=>({
  _meta:{ createdAt: serverTimestamp(), createdBy: uid, updatedAt: serverTimestamp(), updatedBy: uid }
});
export const metaUpdate = (uid)=>({
  "_meta.updatedAt": serverTimestamp(), "_meta.updatedBy": uid
});

export function attachAuthGuard(onReady){
  onAuthStateChanged(auth, async (user)=>{
    if(!user){
      document.getElementById('usrName').textContent = '— (sem login)';
      document.getElementById('usrTenant').textContent = 'tenant: —';
      _claims = { tenantId: "default", role: "" };
      onReady(null);
      return;
    }
    document.getElementById('usrName').textContent = user.displayName || user.email || user.uid;

    // pegar custom claims (tenantId, role)
    try{
      const tok = await getIdTokenResult(user);
      _claims = {
        tenantId: tok.claims.tenantId || "default",
        role: tok.claims.role || ""
      };
    }catch(e){ _claims = { tenantId: "default", role: "" }; }
    document.getElementById('usrTenant').textContent = `tenant: ${_claims.tenantId}`;
    onReady(user);
  });
}

export async function doSignOut(){ await signOut(auth); }

// Storage helpers
export async function uploadToStorage(path, fileOrBlob){
  const r = ref(storage, path);
  const snap = await uploadBytes(r, fileOrBlob, { cacheControl: "public,max-age=31536000" });
  const url = await getDownloadURL(snap.ref);
  return { path, url };
}