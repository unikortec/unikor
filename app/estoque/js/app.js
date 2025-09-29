import { $, dtFile } from "./constants.js";
import { bootFromFirestoreIfNeeded, mountUI, render } from "./ui.js";
import { snapshotNow, pdfEstoqueBlob, pdfPosicaoBlob } from "./pdf.js";
import { clearSession } from "./store.js";
import { fbBatchUpsertSnapshot, ensureAuth } from "./firebase.js";

await ensureAuth();                 // exige login do usuário
await bootFromFirestoreIfNeeded();
mountUI();
render();

/* ===== Ações de topo ===== */
$('#btnExportar').onclick = async ()=>{
  const blob = await pdfEstoqueBlob();
  await salvarSnapshotComoUltimoEEnviar();
  const fname=`ESTOQUE ${dtFile(new Date())}.pdf`;
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
};

$('#btnCompartilhar').onclick = async ()=>{
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
};

$('#btnPosicao').onclick = async ()=>{
  const blob = await pdfPosicaoBlob();
  const fname=`POSIÇÃO ESTOQUE ${dtFile(new Date())}.pdf`;
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
};

$('#btnLimpar').onclick = ()=>{
  if(!confirm('Limpar somente os campos digitados desta tela (não altera o estoque salvo)?')) return;
  clearSession();
  render();
};

async function salvarSnapshotComoUltimoEEnviar(){
  const snap = snapshotNow();
  localStorage.setItem("estoque_v3_last_report", JSON.stringify(snap));
  try{ await fbBatchUpsertSnapshot(snap.data); }
  catch(e){ console.warn('Falha ao enviar snapshot:', e); }
}

/* Service Worker */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').then(async reg=>{
    try{
      await reg.update();
      if(reg.waiting){ reg.waiting.postMessage({type:'SKIP_WAITING'}); }
      if(navigator.serviceWorker.controller){
        navigator.serviceWorker.addEventListener('controllerchange', ()=>location.reload());
      }
    }catch(e){}
  }).catch(()=>{});
}