// /app/pedidos/js/driveQueue.js
import { uploadPedidoPDFToDrive } from './pdf.js';

const KEY = "__drive_upload_queue__";

function loadQ(){
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}
function saveQ(q){
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {}
}

export function queueDriveUpload(job){
  const q = loadQ();
  q.push({ t: Date.now(), ...job });
  saveQ(q);
}

export async function drainDriveQueueWhenOnline(){
  const run = async ()=>{
    if (!navigator.onLine) return;
    let q = loadQ();
    if (!q.length) return;
    console.log(`[DRIVE] Tentando enviar fila (${q.length})…`);
    const rest = [];
    for (const j of q){
      try {
        await uploadPedidoPDFToDrive(j.pedido);
      } catch(e){
        console.warn("[DRIVE] Upload falhou, mantendo na fila.", e);
        rest.push(j); // mantém para tentar depois
      }
    }
    saveQ(rest);
  };

  // roda ao voltar a conexão e também a cada 60s
  window.addEventListener("online", run);
  setInterval(run, 60000);
  // tenta já
  run();
}