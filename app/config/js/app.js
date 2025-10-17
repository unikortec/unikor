import { baixarModelo, lerPlanilha } from './importers.js';
import {
  onReadyAuth, currentUser, tenantIdFromToken,
  upsertProdutosParcial, upsertCustos, upsertMinimo
} from './firestore.js';

function bindButtons(){
  document.getElementById('dlProdutos').onclick = ()=> baixarModelo('produtos');
  document.getElementById('dlCustos').onclick   = ()=> baixarModelo('custos');
  document.getElementById('dlMinimo').onclick   = ()=> baixarModelo('minimo');

  document.getElementById('upProdutos').addEventListener('change', e=> handleUpload(e,'produtos'));
  document.getElementById('upCustos').addEventListener('change', e=> handleUpload(e,'custos'));
  document.getElementById('upMinimo').addEventListener('change', e=> handleUpload(e,'minimo'));
}

async function handleUpload(ev, tipo){
  const file = ev.target.files?.[0];
  if(!file) return;
  try{
    const linhas = await lerPlanilha(file);
    const user = currentUser();
    const tenantId = tenantIdFromToken(user) || window.UNIKOR_TENANT_ID;
    if (!tenantId) throw new Error('Tenant não identificado');

    if (tipo==='produtos') await upsertProdutosParcial(tenantId, linhas, user);
    if (tipo==='custos')   await upsertCustos(tenantId, linhas, user);
    if (tipo==='minimo')   await upsertMinimo(tenantId, linhas, user);

    alert('Importação concluída com sucesso.');
  }catch(err){
    console.error(err);
    alert('Falha ao importar: ' + err.message);
  }finally{
    ev.target.value = '';
  }
}

onReadyAuth(u=>{
  if (!u){ location.href = '/'; return; }
  bindButtons();
});