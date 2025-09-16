// portal/apps/despesas/js/app.js
import { store } from './store.js';
import { parseNFCeXML, parseNFe55XML } from './nfe.js';
import { initDrive, uploadArtifacts } from './drive.js';

// Visual preferido: 'pdf' (compacto). Se preferir sempre JPEG, troque para 'jpeg'.
const VISUAL_FORMAT = 'pdf';

async function getGoogleAccessToken(scope) {
  if (window.UNIKOR_AUTH?.getAccessToken) return await window.UNIKOR_AUTH.getAccessToken(scope);
  if (window.UNIKOR_AUTH?.reauthWithScope) return await window.UNIKOR_AUTH.reauthWithScope(scope);
  throw new Error('Exponha getAccessToken(scope) no auth.js para usar o Drive.');
}

const $ = (s)=>document.querySelector(s);
const brl = (n)=>(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtDate = (iso)=>{ const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; };
const fmtDateName = (iso)=>{ const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; };

let CURRENT_USER = null;
let notas = store.getNotas();
let categorias = store.getCategorias();
let editingId = null;

async function resolveUnikorUser(){
  if(window.UNIKOR_AUTH?.getCurrentUser){
    const u = await window.UNIKOR_AUTH.getCurrentUser();
    if (u) return u;
  }
  if (window.auth?.currentUser) return window.auth.currentUser;
  return null;
}

async function boot(){
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }
  const u = await resolveUnikorUser();
  if(!u){ $('#need-auth').style.display='block'; return; }
  CURRENT_USER = { id: u.uid || u.id || u.email, name: u.displayName || u.name || u.email, role: u.role || u.claims?.role || 'user' };
  store.setUser(CURRENT_USER);
  $('#user-pill').textContent = `${CURRENT_USER.name} • ${CURRENT_USER.role==='master'?'MASTER':'USER'}`;
  $('#app').style.display='block';

  hydrateCats(); bindEvents(); render();
  try { await initDrive(getGoogleAccessToken); } catch (e) { console.warn('Drive não pronto:', e.message); }
}

function bindEvents(){
  $('#btn-new').onclick = ()=> openEditor();
  $('#btn-save').onclick = onSave;
  $('#filter-cat').onchange = render;
  $('#filter-pay').onchange = render;

  // Import XML NFe 55
  $('#xml55').onchange = async (ev)=>{
    const f = ev.target.files?.[0]; if(!f) return;
    const xml = await f.text();
    const nota = parseNFe55XML(xml);
    nota._xml = xml; // manter XML original
    openEditor(nota);
  };
}

function hydrateCats(){
  const sel = $('#in-cat'); sel.innerHTML='';
  categorias.forEach(c=>{ const o=document.createElement('option'); o.textContent=c; sel.appendChild(o); });
  const selF = $('#filter-cat'); selF.innerHTML = '<option value="">Todas as categorias</option>';
  categorias.forEach(c=>{ const o=document.createElement('option'); o.textContent=c; selF.appendChild(o); });
}

function render(){
  const list = $('#list'); list.innerHTML='';
  const ym = new Date().toISOString().slice(0,7);
  const fcat = $('#filter-cat').value; const fpay = $('#filter-pay').value;
  let arr = [...notas].filter(n=> n.data?.startsWith(ym));
  if(fcat) arr = arr.filter(n=> n.categoria===fcat);
  if(fpay) arr = arr.filter(n=> n.pagamento===fpay);
  if(CURRENT_USER.role!=='master') arr = arr.filter(n=> n.ownerId===CURRENT_USER.id);
  arr.sort((a,b)=> b.data.localeCompare(a.data));
  for(const n of arr){
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div>
          <div><strong>${n.empresa}</strong> <span style="opacity:.6">• ${fmtDate(n.data)} • ${n.ownerName}</span></div>
          <div style="font-size:12px;opacity:.7">${n.itens?.length||0} itens • ${n.pagamento} • ${n.origem||'manual'}</div>
          <div style="font-size:12px;opacity:.9"><span style="background:#0b1626;border:1px solid #203044;padding:2px 6px;border-radius:9999px">${n.categoria||'—'}</span></div>
        </div>
        <div style="text-align:right">
          <div><strong>${brl(n.total)}</strong></div>
          ${(CURRENT_USER.role==='master' || n.ownerId===CURRENT_USER.id) ? `
            <div class="row" style="margin-top:6px; justify-content:flex-end">
              <button class="btn" data-edit="${n.id}">Editar</button>
              ${n._xml ? `<button class="btn" data-dl-xml="${n.id}">XML</button>`:''}
              <button class="btn" data-dl-visual="${n.id}">${VISUAL_FORMAT==='pdf'?'PDF':'JPEG'}</button>
            </div>`: ''}
        </div>
      </div>`;
    list.appendChild(card);
  }
  list.querySelectorAll('[data-edit]').forEach(b => b.onclick = ()=> {
    const id = b.getAttribute('data-edit'); const n = notas.find(x=>x.id===id); if(n) openEditor(n);
  });
  list.querySelectorAll('[data-dl-xml]').forEach(b => b.onclick = ()=> downloadXML(b.getAttribute('data-dl-xml')));
  list.querySelectorAll('[data-dl-visual]').forEach(b => b.onclick = ()=> downloadVisual(b.getAttribute('data-dl-visual')));
}

function openEditor(pref={}){
  editingId = pref.id || null;
  $('#dlg-title').textContent = editingId? 'Editar despesa' : 'Nova despesa';
  $('#btn-del').style.display = editingId? 'inline-flex':'none';
  $('#in-emp').value = pref.empresa||'';
  $('#in-date').value = pref.data || new Date().toISOString().slice(0,10);
  $('#in-pay').value = pref.pagamento || 'PIX';
  $('#in-cat').value = pref.categoria || categorias[0];
  $('#in-total').value = (pref.total!=null? String(pref.total).replace('.',',') : '');
  dlg.showModal();
  dlg.dataset.xml = pref._xml || '';
  dlg.dataset.modelo = pref.origem || '';
}

function onSave(){
  const empresa = $('#in-emp').value.trim(); if(!empresa) return alert('Informe a empresa/local');
  const data = $('#in-date').value; if(!data) return alert('Informe a data');
  const pagamento = $('#in-pay').value; const categoria = $('#in-cat').value;
  const total = parseFloat(String($('#in-total').value||'0').replace('.', '').replace(',', '.'))||0;

  const base = { ownerId: CURRENT_USER.id, ownerName: CURRENT_USER.name, empresa, data, pagamento, categoria, total };
  let nota;
  if(editingId){ const i = notas.findIndex(n=> n.id===editingId); if(i>=0){ notas[i] = { ...notas[i], ...base }; nota = notas[i]; } }
  else { nota = { id: String(Date.now()), origem: (dlg.dataset.modelo || 'manual'), itens: [], ...base }; notas.push(nota); }
  if (dlg.dataset.xml) nota._xml = dlg.dataset.xml;

  store.setNotas(notas);
  dlg.close(); render();

  saveArtifactsToDrive(nota).catch(err => console.warn('Drive upload falhou:', err.message));
}

// ====== Visual (PDF/JPEG) =======
function receiptHTML(n) {
  return `
    <div style="font:14px Arial,sans-serif; color:#000; width:320px; padding:10px">
      <h3 style="margin:0 0 6px; font-size:16px">${n.empresa}</h3>
      <div style="font-size:12px; margin-bottom:6px">${fmtDate(n.data)} • ${n.ownerName}</div>
      <div style="border-top:1px dashed #999; margin:6px 0"></div>
      <div>Grupo: ${n.categoria || '-'}</div>
      <div>Pagamento: ${n.pagamento}</div>
      <div style="font-weight:bold; margin-top:6px">Total: ${brl(n.total)}</div>
    </div>
  `;
}
async function buildJPEGBlobFromHTML(html, scale=2, quality=0.85) {
  const box = document.createElement('div'); box.style.position='fixed'; box.style.left='-10000px'; box.innerHTML = html;
  document.body.appendChild(box);
  const canvas = await html2canvas(box.firstElementChild, { scale });
  document.body.removeChild(box);
  return await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
}
async function buildPDFBlobFromHTML(html) {
  const { jsPDF } = window.jspdf;
  const jpg = await buildJPEGBlobFromHTML(html, 2, 0.9);
  const imgData = await blobToDataURL(jpg);
  const pdf = new jsPDF({ unit: 'mm', format: 'a6' }); // pequeno e legível
  const img = new Image(); img.src = imgData; await img.decode();
  const pageW = 105, pageH = 148, pxToMm = 25.4/96;
  const w = img.width * pxToMm, h = img.height * pxToMm;
  const ratio = Math.min(pageW / w, pageH / h);
  const W = w * ratio, H = h * ratio;
  pdf.addImage(imgData, 'JPEG', (pageW-W)/2, (pageH-H)/2, W, H);
  return pdf.output('blob');
}
function blobToDataURL(blob){ return new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(blob); }); }

async function buildVisualBlob(nota) {
  const html = receiptHTML(nota);
  if (VISUAL_FORMAT === 'pdf') {
    try { return await buildPDFBlobFromHTML(html); } catch(e) { console.warn('PDF falhou, usando JPEG:', e.message); }
  }
  return await buildJPEGBlobFromHTML(html, 2, 0.85);
}

function fileBaseName(n){ // "GRUPO DD-MM-AAAA"
  const grupo = (n.categoria || 'SemGrupo').replace(/[\\/:*?"<>|]/g,'-');
  return `${grupo} ${fmtDateName(n.data)}`;
}

async function saveArtifactsToDrive(nota){
  const visualBlob = await buildVisualBlob(nota);
  const isPdf = (visualBlob.type === 'application/pdf');
  const visualName = `${fileBaseName(nota)}.${isPdf ? 'pdf' : 'jpg'}`;
  const xmlBlob = nota._xml ? new Blob([nota._xml], { type:'text/xml' }) : null;
  const xmlName = nota._xml ? `${fileBaseName(nota)}.xml` : null;

  await uploadArtifacts({
    isoDate: nota.data,
    visualBlob, visualName,
    xmlBlob, xmlName
  });
}

// ====== Downloads locais ======
function downloadXML(id){
  const n = notas.find(x=>x.id===id); if(!n || !n._xml) return alert('Sem XML armazenado nesta nota.');
  const blob = new Blob([n._xml], { type:'text/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileBaseName(n)}.xml`;
  a.click();
}
async function downloadVisual(id){
  const n = notas.find(x=>x.id===id); if(!n) return;
  const visual = await buildVisualBlob(n);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(visual);
  const ext = (visual.type === 'application/pdf') ? 'pdf' : 'jpg';
  a.download = `${fileBaseName(n)}.${ext}`;
  a.click();
}

boot();