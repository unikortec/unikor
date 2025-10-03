// /app/pedidos/js/driveQueue.js
const KEY = "__drive_upload_queue__";

function loadQ(){
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}
function saveQ(q){
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {}
}

/**
 * Enfileira um job de reenvio depois.
 * Exemplo de `job`: { type:"REBUILD_FROM_DOM", when: Date.now() }
 */
export function queueDriveUpload(job){
  const q = loadQ();
  q.push({ t: Date.now(), ...job });
  saveQ(q);
}

/** Placeholder para futura drenagem baseada em reconstrução do PDF */
export async function drainDriveQueueWhenOnline(){
  const run = async ()=>{
    if (!navigator.onLine) return;
    const q = loadQ();
    if (!q.length) return;
    console.log(`[DRIVE] Existem ${q.length} itens na fila. (reenvio ainda não implementado)`);
    // Mantém por enquanto
  };
  window.addEventListener("online", run);
  setInterval(run, 60000);
  run();
}