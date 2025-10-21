import { db, collection, addDoc, serverTimestamp, getCurrentUser } from '/js/firebase.js';

const TENANT_DEFAULT = 'serranobrecarnes.com.br';

export async function saveExpense(data){
  const user = getCurrentUser();
  const tenantId = user?.tenantId || TENANT_DEFAULT;

  const col = collection(db, 'tenants', tenantId, 'expenses');
  const payload = {
    ...data,
    tenantId,
    createdAt: serverTimestamp(),
    createdBy: user?.email?.split('@')[0] || 'anon'
  };
  return addDoc(col, payload);
}