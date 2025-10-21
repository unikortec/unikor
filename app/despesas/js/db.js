import { db, auth, collection, addDoc, serverTimestamp } from '/js/firebase.js';

const TENANT_FALLBACK = 'serranobrecarnes.com.br';

async function getTenantId(){
  const u = auth.currentUser;
  if (!u) return TENANT_FALLBACK;
  try{
    const t = await u.getIdTokenResult(true);
    return t.claims?.tenantId || TENANT_FALLBACK;
  }catch{ return TENANT_FALLBACK; }
}

export async function saveExpense(data){
  const tenantId = await getTenantId();
  const col = collection(db, 'tenants', tenantId, 'expenses');
  const payload = {
    ...data,
    tenantId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: 'FORM-MANUAL'
  };
  return addDoc(col, payload);
}