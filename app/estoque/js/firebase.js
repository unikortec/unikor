// Firebase multi-tenant (sem anônimo) — requer usuário logado
import {
  initializeApp, getApps, getApp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, serverTimestamp, doc, runTransaction, collection,
  addDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// O projeto raiz expõe apenas firebaseConfig
import { firebaseConfig } from "../../../js/firebase.js";

// Instância única
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// URL do dashboard/login (ajuste se necessário)
const LOGIN_URL = "/app/";

// ======== Helpers de autenticação & tenant ========
export async function ensureAuth(){
  if (auth.currentUser) return auth.currentUser;
  const u = await new Promise((resolve)=>{
    const t = setTimeout(()=>resolve(null), 1500);
    onAuthStateChanged(auth, (user)=>{ clearTimeout(t); resolve(user||null); });
  });
  if (u) return u;
  window.location.href = LOGIN_URL;
  throw new Error("Usuário não autenticado.");
}

let _tenantIdCache = null;
/** Obtém tenantId das custom claims e cacheia na sessão */
export async function getTenantId(){
  if (_tenantIdCache) return _tenantIdCache;
  const user = await ensureAuth();
  const token = await user.getIdTokenResult();
  const tid = token.claims?.tenantId || "";
  if (!tid) throw new Error("Sem tenantId nas claims do usuário.");
  _tenantIdCache = tid;
  return tid;
}

// ======== IDs & paths ========
export const invId = (family, product) =>
  `${family}__${product}`.toUpperCase().replace(/\s+/g,' ').trim();

const invPath = (tenantId, id) => doc(db, `tenants/${tenantId}/inventory/${id}`);
const invCol  = (tenantId)     => collection(db, `tenants/${tenantId}/inventory`);
const histCol = (tenantId)     => collection(db, `tenants/${tenantId}/history`);
// (pedidos/despesas ficarão em: tenants/{tenantId}/pedidos e tenants/{tenantId}/despesas)

// ======== INVENTORY: upsert 1 item ========
export async function fbUpsertItemKG({ family, product, resfriado_kg, congelado_kg }){
  const user = await ensureAuth();
  const tenantId = await getTenantId();
  const id  = invId(family, product);
  const ref = invPath(tenantId, id);

  await runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    const base = snap.exists() ? snap.data() : {
      family: String(family||"").toUpperCase(),
      product: String(product||"").toUpperCase(),
      // campos exigidos nas rules:
      resfriado_kg: 0, resfriado_cx: 0, resfriado_un: 0,
      congelado_kg: 0, congelado_cx: 0, congelado_un: 0
    };
    const d = {
      ...base,
      resfriado_kg: +resfriado_kg || 0,
      congelado_kg: +congelado_kg || 0,
      // garantimos os demais campos (as rules exigem)
      resfriado_cx: +base.resfriado_cx || 0,
      resfriado_un: +base.resfriado_un || 0,
      congelado_cx: +base.congelado_cx || 0,
      congelado_un: +base.congelado_un || 0,
      updatedat: serverTimestamp() // nome conforme rules
    };
    tx.set(ref, d, { merge: true });
  });

  // opcional: registrar 2 movimentos (RESFRIADO/CONGELADO) no histórico, conforme rules
  const famU = String(family||"").toUpperCase();
  const prodU= String(product||"").toUpperCase();
  const at = serverTimestamp();
  if ((+resfriado_kg || 0) >= 0) {
    await addDoc(histCol(tenantId), {
      family: famU, product: prodU, tipo: "RESFRIADO", unit: "KG",
      qty: +resfriado_kg || 0, at
    });
  }
  if ((+congelado_kg || 0) >= 0) {
    await addDoc(histCol(tenantId), {
      family: famU, product: prodU, tipo: "CONGELADO", unit: "KG",
      qty: +congelado_kg || 0, at
    });
  }

  return { uid: user.uid, tenantId, id };
}

// ======== INVENTORY: upsert snapshot completo ========
export async function fbBatchUpsertSnapshot(snapshotData){
  await ensureAuth();
  const tenantId = await getTenantId();
  const batch = writeBatch(db);

  // Upsert inventory
  for (const fam of Object.keys(snapshotData)){
    for (const prod of Object.keys(snapshotData[fam])){
      const v = snapshotData[fam][prod] || {};
      const ref = invPath(tenantId, invId(fam, prod));
      batch.set(ref, {
        family: String(fam||"").toUpperCase(),
        product: String(prod||"").toUpperCase(),
        resfriado_kg: +(v.RESFRIADO_KG || 0),
        congelado_kg: +(v.CONGELADO_KG || 0),
        // campos obrigatórios nas rules
        resfriado_cx: 0, resfriado_un: 0,
        congelado_cx: 0, congelado_un: 0,
        updatedat: serverTimestamp()
      }, { merge: true });
    }
  }
  await batch.commit();

  // Registrar movimentos no history conforme rules (append-only).
  // Aqui registramos apenas totais "atuais" por item (um para RESF e outro para CONG).
  const at = serverTimestamp();
  for (const fam of Object.keys(snapshotData)){
    for (const prod of Object.keys(snapshotData[fam])){
      const v = snapshotData[fam][prod] || {};
      const famU = String(fam||"").toUpperCase();
      const prodU= String(prod||"").toUpperCase();
      const rk = +(v.RESFRIADO_KG || 0);
      const ck = +(v.CONGELADO_KG || 0);
      await addDoc(histCol(tenantId), { family:famU, product:prodU, tipo:"RESFRIADO", unit:"KG", qty:rk, at });
      await addDoc(histCol(tenantId), { family:famU, product:prodU, tipo:"CONGELADO", unit:"KG", qty:ck, at });
    }
  }
}

// ======== INVENTORY: leitura completa ========
export async function fbFetchAllInventory(){
  await ensureAuth();
  const tenantId = await getTenantId();
  const snap = await getDocs(invCol(tenantId));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}