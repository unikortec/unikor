// app/estoque/js/firebase.js
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  initializeApp, getApps, getApp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore, serverTimestamp, doc, runTransaction, collection,
  addDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Importa APENAS o config do app raiz (não exporta 'app' aí)
import { firebaseConfig } from "../../../js/firebase.js";

// Instância única do Firebase App
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// URL de login do seu portal (ajuste se necessário)
const LOGIN_URL = "/"; // ex.: "/login" se você tiver rota dedicada

// Garante que o usuário esteja logado (sem anônimo)
export async function ensureAuth(){
  const user = auth.currentUser;
  if (user) return user;

  // Espera uma virada curta do onAuthStateChanged
  const waited = await new Promise(resolve=>{
    const t = setTimeout(()=>resolve(null), 1500);
    import("https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js").then(({onAuthStateChanged})=>{
      onAuthStateChanged(auth, u=>{ clearTimeout(t); resolve(u||null); });
    }).catch(()=>resolve(null));
  });

  if (waited) return waited;
  // Sem usuário → manda para login
  window.location.href = LOGIN_URL;
  throw new Error("Usuário não autenticado.");
}

export const invId = (family, product) =>
  `${family}__${product}`.toUpperCase().replace(/\s+/g,' ').trim();

export async function fbUpsertItemKG({ family, product, resfriado_kg, congelado_kg }){
  await ensureAuth();
  const id  = invId(family, product);
  const ref = doc(db, "inventory", id);

  await runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    const base = snap.exists() ? snap.data() : {
      family: family.toUpperCase(),
      product: product.toUpperCase(),
      resfriado_kg: 0,
      congelado_kg: 0
    };
    const d = {
      ...base,
      resfriado_kg: +resfriado_kg || 0,
      congelado_kg: +congelado_kg || 0,
      updated_at: serverTimestamp()
    };
    tx.set(ref, d, { merge: true });
  });

  await addDoc(collection(db, "history"), {
    family, product, action: "UPSERT_ITEM_KG",
    resfriado_kg: +resfriado_kg || 0,
    congelado_kg: +congelado_kg || 0,
    at: serverTimestamp(),
    source: "pwa-estoque-v1"
  });
}

export async function fbBatchUpsertSnapshot(snapshotData){
  await ensureAuth();
  const batch = writeBatch(db);
  for (const fam of Object.keys(snapshotData)){
    for (const prod of Object.keys(snapshotData[fam])){
      const v = snapshotData[fam][prod] || {};
      const ref = doc(db, "inventory", invId(fam, prod));
      batch.set(ref, {
        family: fam.toUpperCase(),
        product: prod.toUpperCase(),
        resfriado_kg: +(v.RESFRIADO_KG || 0),
        congelado_kg: +(v.CONGELADO_KG || 0),
        updated_at: serverTimestamp()
      }, { merge: true });
    }
  }
  await batch.commit();

  await addDoc(collection(db, "history"), {
    action: "UPSERT_SNAPSHOT_KG",
    at: serverTimestamp(),
    source: "pwa-estoque-v1"
  });
}

export async function fbFetchAllInventory(){
  await ensureAuth();
  const snap = await getDocs(collection(db, "inventory"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}