// ===== UNIKOR • Despesas • DB =====
// Usa o Firebase raiz (/js/firebase.js)

import {
  db, collection, addDoc, serverTimestamp
} from '/js/firebase.js';
import { getCurrentUser } from '/js/firebase.js';

const TENANT_FALLBACK = 'serranobrecarnes.com.br';

async function getTenantId() {
  const u = getCurrentUser();
  if (!u) throw new Error('Usuário não autenticado');
  try {
    const tok = await u.getIdTokenResult(true);
    return tok.claims?.tenantId || TENANT_FALLBACK;
  } catch {
    return TENANT_FALLBACK;
  }
}

/** Salva uma despesa em tenants/{tenantId}/despesas */
export async function saveExpense(data) {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado');

  const tenantId = await getTenantId();
  const colRef = collection(db, 'tenants', tenantId, 'despesas');

  const payload = {
    ...data,
    tenantId,
    createdBy: user.uid,
    createdByName: (user.email || '').split('@')[0],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await addDoc(colRef, payload);
  return payload;
}