// app/despesas/js/firebase.js
export * from '/js/firebase.js';

import { db, TENANT_ID } from '/js/firebase.js';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  getDocs, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Coleção de despesas do tenant logado
const colDespesas = () => collection(db, "tenants", TENANT_ID, "despesas");

// Criar despesa
export async function salvarDespesa(data) {
  const base = {
    ...data,
    tenantId: TENANT_ID,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp()
  };
  const ref = await addDoc(colDespesas(), base);
  return ref.id;
}

// Atualizar despesa
export async function atualizarDespesa(id, data) {
  const ref = doc(db, "tenants", TENANT_ID, "despesas", id);
  await updateDoc(ref, {
    ...data,
    atualizadoEm: serverTimestamp()
  });
}

// Deletar despesa
export async function excluirDespesa(id) {
  const ref = doc(db, "tenants", TENANT_ID, "despesas", id);
  await deleteDoc(ref);
}

// Buscar todas as despesas (ex: para relatórios)
export async function listarDespesas() {
  const snap = await getDocs(colDespesas());
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Buscar despesa por id
export async function getDespesa(id) {
  const ref = doc(db, "tenants", TENANT_ID, "despesas", id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}