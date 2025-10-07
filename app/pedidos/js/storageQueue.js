// app/pedidos/js/storageQueue.js
// Fila confiável para enviar PDFs de pedidos ao Firebase Storage.
// - Se online: tenta enviar na hora.
// - Se falhar/offline: enfileira um job leve (sem Base64) e mais tarde reconstrói o PDF a partir do Firestore.

import { app, db } from './firebase.js';
import {
  getStorage, ref, uploadBytes
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import {
  collection, doc, setDoc, serverTimestamp
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

// ---------- dreno (singleton) ----------
let _started = false;
let _draining = false;

async function _run(){
  if (_draining) return;
  _draining = true;
  try{
    let q = loadQ();
    if (!q.length || !navigator.onLine) return;

    const rest = [];
    for (const job of q){
      try{
        let blob = null;
        let filename = job.filename || "pedido.pdf";

        if (job.source === "rebuild"){
          // Reconstrói o PDF lendo o pedido salvo no Firestore
          const { getTenantId } = await import("./firebase.js");
          const { doc, getDoc } =
            await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js");
          const { construirPDFDePedidoFirestore } = await import("./storageQueueHelpers.js");

          const tenantId = job.tenantId || (await getTenantId());
          const ref = doc(db, "tenants", tenantId, "pedidos", job.docId);
          const snap = await getDoc(ref);
          if (!snap.exists()) throw new Error("Doc do pedido não encontrado para rebuild.");
          const pedido = snap.data() || {};

          const { blob: rebuiltBlob, nomeArq } = await construirPDFDePedidoFirestore(pedido);
          blob = rebuiltBlob; if (nomeArq) filename = nomeArq;
        } else if (job.dataUrl){
          // compat com jobs antigos que tinham dataUrl
          const res = await fetch(job.dataUrl);
          blob = await res.blob();
        }

        if (!blob) throw new Error("Blob ausente no job para upload.");
        await uploadAndTag({ tenantId: job.tenantId, docId: job.docId, blob, filename });
      }catch(e){
        console.warn("[StorageQueue] falhou, mantém na fila:", e?.message || e);
        rest.push(job); // mantém para tentar depois
      }
    }
    saveQ(rest);
  } finally {
    _draining = false;
  }
}

/** Drena a fila periodicamente e quando voltar a conexão (garantindo 1 só timer/listener). */
export function drainStorageQueueWhenOnline(){
  if (_started) return;
  _started = true;
  window.addEventListener("online", _run, { passive:true });
  setInterval(_run, 45000);
  _run(); // primeira tentativa agora
}

/** Gatilho imediato (ex.: logo após enfileirar). */
export async function drainOnce(){
  await _run();
}