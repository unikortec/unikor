// app/pedidos/js/storageQueue.js
// Fila confiável para enviar PDFs de pedidos ao Firebase Storage.
// - Se online: tenta enviar na hora.
// - Se falhar/offline: enfileira um job leve (sem Base64) e mais tarde reconstrói o PDF a partir do Firestore.

import { app, db } from './firebase.js';
import {
  getStorage, ref, uploadBytes
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import {
  collection, doc, setDoc, serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const storage = getStorage(app);

const KEY = "__unikor_storage_upload_queue_v2__";

// ---------- helpers de persistência ----------
function loadQ(){
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}
function saveQ(q){
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {}
}

// Blob -> ArrayBuffer (para uploadBytes)
function blobToArrayBuffer(blob){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsArrayBuffer(blob);
  });
}

// Envia ao Storage + anota no Firestore
async function uploadAndTag({ tenantId, docId, blob, filename }){
  const path = `tenants/${tenantId}/pedidos/${docId}.pdf`;
  const r = ref(storage, path);

  const bytes = await blobToArrayBuffer(blob);
  await uploadBytes(r, new Uint8Array(bytes), { contentType: "application/pdf" });

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

  console.log("[StorageQueue] enviado:", path);
}

// ========== Runner compartilhado (usado no agendador e no drainOnce) ==========
async function runQueueOnce(){
  let q = loadQ();
  if (!q.length || !navigator.onLine) return;

  const rest = [];
  for (const job of q){
    try{
      let blob = null;
      let filename = job.filename || "pedido.pdf";

      if (job.source === "rebuild"){
        // Reconstroi o PDF lendo o pedido salvo no Firestore
        const { getTenantId } = await import("./firebase.js");
        const { doc, getDoc } =
          await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js");
        const { construirPDFDePedidoFirestore } = await import("./storageQueueHelpers.js");
        // construirPDFDePedidoFirestore: helper isolado p/ evitar import circular do pdf.js aqui.

        const tenantId = job.tenantId || (await getTenantId());
        const ref = doc(db, "tenants", tenantId, "pedidos", job.docId);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Doc do pedido não encontrado para rebuild.");
        const pedido = snap.data() || {};

        const { blob: rebuiltBlob, nomeArq } = await construirPDFDePedidoFirestore(pedido);
        blob = rebuiltBlob; if (nomeArq) filename = nomeArq;
      } else if (job.dataUrl){
        // (modo antigo – compat) se algum job antigo ainda existe com dataUrl:
        const res = await fetch(job.dataUrl); blob = await res.blob();
      }

      if (!blob) throw new Error("Blob ausente no job para upload.");
      await uploadAndTag({ tenantId: job.tenantId, docId: job.docId, blob, filename });
    }catch(e){
      console.warn("[StorageQueue] falhou, mantém na fila:", e?.message || e);
      rest.push(job); // mantém para tentar depois
    }
  }
  saveQ(rest);
}

// ========== API ==========

/**
 * Sobe o PDF imediatamente se possível; se não, coloca na fila (job leve).
 * @param {Object} p
 * @param {string} p.tenantId
 * @param {string} p.docId
 * @param {Blob}   p.blob
 * @param {string} p.filename
 */
export async function queueStorageUpload({ tenantId, docId, blob, filename }){
  // tenta envio direto quando online
  if (navigator.onLine){
    try{
      await uploadAndTag({ tenantId, docId, blob, filename });
      return;
    }catch(e){
      console.warn("[StorageQueue] upload imediato falhou, vai para fila:", e?.message||e);
    }
  }

  // fallback: salva job leve (reconstrói depois a partir do Firestore)
  const q = loadQ();
  q.push({ t: Date.now(), tenantId, docId, filename, source: "rebuild" });
  saveQ(q);
  console.log("[StorageQueue] job enfileirado (rebuild):", docId);
}

/** Drena a fila periodicamente e quando voltar a conexão. */
export function drainStorageQueueWhenOnline(){
  const run = () => { runQueueOnce().catch(()=>{}); };

  window.addEventListener("online", run);
  setInterval(run, 45000);
  run();
}

/** Faz uma drenagem única imediatamente (usado após salvar/compartilhar). */
export async function drainOnce(){
  try { await runQueueOnce(); } catch(e) { /* silencioso */ }
}