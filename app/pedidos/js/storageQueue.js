// app/pedidos/js/storageQueue.js
// Fila para enviar PDFs de pedidos ao Firebase Storage (com retry offline).

import { app, db, storage } from './firebase.js';
import { ref, uploadString } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { collection, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const KEY = "__unikor_storage_upload_queue__";

// ---------- helpers de persistência ----------
function loadQ(){
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}
function saveQ(q){
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {}
}

// Converte Blob → dataURL (para enfileirar com segurança no localStorage)
async function blobToDataURL(blob){
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/**
 * Enfileira um upload de PDF para o Storage.
 * @param {Object} p
 * @param {string} p.tenantId
 * @param {string} p.docId
 * @param {Blob}   p.blob
 * @param {string} p.filename
 */
export async function queueStorageUpload({ tenantId, docId, blob, filename }){
  if (!tenantId || !docId || !blob) return;
  const dataUrl = await blobToDataURL(blob);
  const q = loadQ();
  q.push({ t: Date.now(), tenantId, docId, dataUrl, filename });
  saveQ(q);
}

/** Roda periodicamente e quando volta a conexão. */
export function drainStorageQueueWhenOnline(){
  const run = async ()=>{
    let q = loadQ();
    if (!q.length || !navigator.onLine) return;

    const rest = [];
    for (const job of q){
      try{
        // 🔹 Caminho padronizado
        const path = `tenants/${job.tenantId}/pedidos/${job.docId}/pedido.pdf`;
        const r = ref(storage, path);

        // data_url → uploadString
        await uploadString(r, job.dataUrl, 'data_url', { contentType: 'application/pdf' });

        // 🔹 Atualiza metadados no Firestore
        const pedidosCol = collection(db, "tenants", job.tenantId, "pedidos");
        await setDoc(
          doc(pedidosCol, job.docId),
          {
            pdfPath: path,
            pdfName: job.filename || 'pedido.pdf',
            pdfCreatedAt: serverTimestamp()
          },
          { merge: true }
        );

        console.log("[StorageQueue] enviado:", path);
      }catch(e){
        console.warn("[StorageQueue] falhou, mantém na fila:", e?.message || e);
        rest.push(job);
      }
    }
    saveQ(rest);
  };

  window.addEventListener("online", run);
  setInterval(run, 45000);
  run();
}