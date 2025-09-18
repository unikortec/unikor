import { $, dtFile } from "./constants.js";
import { bootFromFirestoreIfNeeded, mountUI, render } from "./ui.js";
import { snapshotNow, pdfEstoqueBlob, pdfPosicaoBlob } from "./pdf.js";
import { clearSession } from "./store.js";
import { fbBatchUpsertSnapshot, ensureAuth } from "./firebase.js";

// Boot robusto: garante auth e tenta sincronizar "último" sem travar UI
try { await ensureAuth(); } catch {}

await bootFromFirestoreIfNeeded();
mountUI();
render();

/* ===== Ações topo ===== */
$('#btnExportar')?.addEventListener('click', async ()=>{
  const blob = await pdfEstoqueBlob();
  await salvarSnapshotComoUltimoEEnviar();
  const fname=`ESTOQUE ${dtFile(new Date())}.pdf`;
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
});

$('#btnCompartilhar')?.addEventListener('click', async ()=>{
  const blob = await pdfEstoqueBlob();
  await salvarSnapshotComoUltimoEEnviar();
  const fname=`ESTOQUE ${dtFile(new Date())}.pdf`;
  const file=new File([blob],fname,{type:'application/pdf'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:'Estoque',text:'Relatório de estoque'});}catch(e){}
  }else{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
});

$('#btnPosicao')?.addEventListener('click', async ()=>{
  const blob = await pdfPosicaoBlob();
  const fname=`POSIÇÃO ESTOQUE ${dtFile(new Date())}.pdf`;
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
});

$('#btnLimpar')?.addEventListener('click', ()=>{
  if(!confirm('Limpar somente os campos digitados desta tela (não altera o estoque salvo)?')) return;
  clearSession();
  render();
});

/* ===== Persistência: salvar snapshot local + Firestore ===== */
async function salvarSnapshotComoUltimoEEnviar(){
  const snap = snapshotNow();
  localStorage.setItem("estoque_v3_last_report", JSON.stringify(snap));
  try{ await fbBatchUpsertSnapshot(snap.data); }catch(e){ console.warn('Falha ao enviar snapshot:', e); }
}
