// Fila confiável para enviar PDFs de pedidos ao Firebase Storage.
// - Se online: tenta enviar na hora.
// - Se falhar/offline: enfileira um job leve (sem Base64) e mais tarde reconstrói o PDF a partir do Firestore.

import { app, db, getTenantId } from './firebase.js';
import { getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { collection, doc, setDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { construirPDFDePedidoFirestore } from "./storageQueueHelpers.js";

const storage = getStorage(app);
const KEY = "__unikor_storage_upload_queue_v2__";

// ---------- helpers de persistência da fila no localStorage ----------
function loadQ(){
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}
function saveQ(q){
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch(e) {
    console.error("[StorageQueue] Falha ao salvar fila no localStorage:", e);
  }
}

/** Converte um Blob para ArrayBuffer, necessário para uploadBytes. */
function blobToArrayBuffer(blob){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = (err) => reject(err);
    fr.readAsArrayBuffer(blob);
  });
}

/**
 * Faz o upload do Blob para o Firebase Storage e atualiza o documento no Firestore com o caminho do PDF.
 * @param {{tenantId: string, docId: string, blob: Blob, filename: string}} params
 */
async function uploadAndTag({ tenantId, docId, blob, filename }){
  const path = `tenants/${tenantId}/pedidos/${docId}.pdf`;
  const storageRef = ref(storage, path);

  const bytes = await blobToArrayBuffer(blob);
  await uploadBytes(storageRef, bytes, { contentType: "application/pdf" });

  const pedidosCol = collection(db, "tenants", tenantId, "pedidos");
  await setDoc(
    doc(pedidosCol, docId),
    {
      pdfPath: path,
      pdfName: filename || "pedido.pdf",
      pdfCreatedAt: serverTimestamp()
    },
    { merge: true }
  );

  console.log("[StorageQueue] Enviado com sucesso:", path);
}

/**
 * Processa a fila de uploads pendentes. É executado periodicamente e quando a conexão volta.
 */
async function runQueueOnce(){
  let q = loadQ();
  if (!q.length || !navigator.onLine) return;

  const jobsRestantes = [];
  for (const job of q){
    try{
      let blob = null;
      let filename = job.filename || "pedido.pdf";

      if (job.source === "rebuild"){
        // Reconstroi o PDF lendo o pedido salvo no Firestore
        const tenantId = job.tenantId || (await getTenantId());
        const docRef = doc(db, "tenants", tenantId, "pedidos", job.docId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) throw new Error(`Doc do pedido ${job.docId} não encontrado para rebuild.`);
        
        const { blob: rebuiltBlob, nomeArq } = await construirPDFDePedidoFirestore(snap.data());
        blob = rebuiltBlob;
        if (nomeArq) filename = nomeArq;

      } else if (job.dataUrl) { // Modo antigo para compatibilidade
        const res = await fetch(job.dataUrl);
        blob = await res.blob();
      }

      if (!blob) throw new Error(`Blob ausente no job para upload do doc ${job.docId}.`);
      
      await uploadAndTag({ tenantId: job.tenantId, docId: job.docId, blob, filename });

    } catch(e) {
      console.warn("[StorageQueue] Falha ao processar job, será mantido na fila:", e?.message || e);
      jobsRestantes.push(job); // Mantém o job na fila para tentar novamente
    }
  }
  saveQ(jobsRestantes);
}

// ========== API PÚBLICA ==========

/**
 * Adiciona um PDF à fila de upload. Tenta enviar imediatamente se online;
 * caso contrário, enfileira um job leve para ser processado depois.
 * @param {{tenantId: string, docId: string, blob: Blob, filename: string}} params
 */
export async function queueStorageUpload({ tenantId, docId, blob, filename }){
  // Tenta o envio direto quando online para uma experiência mais rápida
  if (navigator.onLine){
    try{
      await uploadAndTag({ tenantId, docId, blob, filename });
      return; // Sucesso, não precisa enfileirar
    }catch(e){
      console.warn("[StorageQueue] Upload imediato falhou, enfileirando para mais tarde:", e?.message||e);
    }
  }

  // Fallback: salva um job leve que permite reconstruir o PDF depois
  const q = loadQ();
  q.push({ t: Date.now(), tenantId, docId, filename, source: "rebuild" });
  saveQ(q);
  console.log("[StorageQueue] Job enfileirado (rebuild):", docId);
}

/**
 * Inicia o processo que verifica e processa a fila periodicamente e quando a conexão de rede é restaurada.
 */
export function drainStorageQueueWhenOnline(){
  const run = () => { runQueueOnce().catch(()=>{}); };

  window.addEventListener("online", run);
  setInterval(run, 45000); // Tenta a cada 45 segundos
  setTimeout(run, 2000); // Tenta uma vez logo após o carregamento da página
}

/**
 * Força uma única tentativa de processar a fila imediatamente.
 * Útil para ser chamado após salvar um pedido, para dar feedback mais rápido ao usuário.
 */
export async function drainOnce(){
  try { await runQueueOnce(); } catch(e) { /* falha silenciosa */ }
}
