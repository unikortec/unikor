import { $, dtFile } from "./constants.js";
import { bootFromFirestoreIfNeeded, mountUI, render } from "./ui.js";
import { snapshotNow, pdfEstoqueBlob, pdfPosicaoBlob } from "./pdf.js";
import { clearSession } from "./store.js";
import { fbBatchUpsertSnapshot, ensureAuth } from "./firebase.js";

await ensureAuth();                 // exige usuário logado
await bootFromFirestoreIfNeeded();

mountUI();
render();

/* ===== Ações do topo ===== */
$('#btnExportar').onclick = async ()=>{
  const blob = await pdfEstoqueBlob();
  await salvarSnapshotComoUltimoEEnviar();
  const fname=`ESTOQUE ${dtFile(new Date())}.pdf`;
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
};

$('#btnCompartilhar').onclick = async ()=>{
  const blob = await pdfEstoqueBlob();
  await salvarSnapshotComoUltimoEEnviar();
  const fname=`ESTOQUE ${dtFile(new Date())}.pdf`;
  const file=new File([blob],fname,{type:'application/pdf'});

  // Heurística: tenta Web Share c/ arquivos; se falhar, tenta share por URL; último fallback = download
  const canShareFiles = !!(navigator.canShare && navigator.canShare({files:[file]}));
  try{
    if (canShareFiles){
      await navigator.share({ files:[file], title:'Estoque', text:'Relatório de estoque' });
      return;
    }
  }catch(e){ /* segue p/ fallback */ }

  try{
    // Alguns iOS/WhatsApp aceitam URL/texto melhor que files
    const url = URL.createObjectURL(blob);
    await navigator.share?.({ title:'Estoque', text:'Relatório de estoque (PDF gerado agora).', url });
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    return;
  }catch(e){ /* segue p/ download */ }

  // Fallback universal: download direto
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
};

$('#btnPosicao').onclick = async ()=>{
  const blob = await pdfPosicaoBlob();
  const fname=`POSIÇÃO ESTOQUE ${dtFile(new Date())}.pdf`;
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
};

$('#btnLimpar').onclick = ()=>{
  if(!confirm('Limpar somente os campos digitados desta tela (não altera o estoque salvo)?')) return;
  clearSession();
  render();
};

/* ===== Persistência: salvar snapshot local + enviar apenas mudanças ===== */
function diffData(cur, last){
  const out = {};
  const families = new Set([...Object.keys(cur||{}), ...Object.keys(last||{})]);
  for (const fam of families){
    const prods = new Set([
      ...Object.keys(cur?.[fam]||{}),
      ...Object.keys(last?.[fam]||{})
    ]);
    for (const p of prods){
      const a = cur?.[fam]?.[p]; // atual
      const b = last?.[fam]?.[p]; // anterior
      const aR = +(a?.RESFRIADO_KG||0), aC = +(a?.CONGELADO_KG||0);
      const bR = +(b?.RESFRIADO_KG||0), bC = +(b?.CONGELADO_KG||0);
      if (aR!==bR || aC!==bC){
        (out[fam]??={})[p] = { RESFRIADO_KG:aR, CONGELADO_KG:aC };
      }
    }
  }
  return out;
}

async function salvarSnapshotComoUltimoEEnviar(){
  const snap = snapshotNow();
  // lê "último" salvo localmente (se houver)
  const lastStr = localStorage.getItem("estoque_v3_last_report");
  const last = lastStr ? JSON.parse(lastStr) : null;

  // salva o novo "último"
  localStorage.setItem("estoque_v3_last_report", JSON.stringify(snap));

  // envia só o que mudou (evita escrita desnecessária no Firestore)
  try{
    const diffs = diffData(snap.data, last?.data||{});
    if (Object.keys(diffs).length){
      await fbBatchUpsertSnapshot(diffs);
    }
  }catch(e){
    console.warn('Falha ao enviar snapshot (diff):', e);
  }
}

/* ===== Service Worker (escopo /app/estoque/) ===== */
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