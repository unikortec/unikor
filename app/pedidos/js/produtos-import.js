// /app/pedidos/js/produtos-import.js
// Pequena UI de import para XLSX/CSV/JSON -> Firestore
// Abre via: botão/atalho ou hash #importar-produtos

import {
  db, getTenantId,
  collection, doc, setDoc, serverTimestamp
} from './firebase.js';

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

function norm(s){
  return String(s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// carrega lib XLSX on-demand
async function ensureXLSX(){
  if (window.XLSX) return;
  await new Promise((res, rej)=>{
    const sc = document.createElement('script');
    sc.src = XLSX_URL; sc.onload = res; sc.onerror = ()=>rej(new Error('Falha ao carregar XLSX'));
    document.head.appendChild(sc);
  });
}

function parseAliases(v){
  if (!v) return [];
  if (Array.isArray(v)) return v.map(norm).filter(Boolean);
  // aceita ; , ou / como separador
  return String(v).split(/[;,/]/g).map(norm).filter(Boolean);
}

function normalizeRow(row){
  // aceita várias chaves comuns
  const nome = norm(row.nome || row.NOME || row.titulo || row.TITULO || row.produto || row.PRODUTO);
  if (!nome) return null;
  const unidade = String(row.unidade || row.UNIDADE || row.un || row.UN || 'KG').trim().toUpperCase();
  const precoRaw = row.preco ?? row.PRECO ?? row.valor ?? row.VALOR ?? 0;
  const preco = Number(String(precoRaw).replace(',', '.'));
  const ativo = (String(row.ativo ?? row.ATIVO ?? 'true').toLowerCase() !== 'false');
  const aliases = parseAliases(row.aliases || row.ALIases || row.ALIAS || row.SINONIMOS || row.sinonimos);

  return { id: nome, data: { nome, unidade, preco: (isFinite(preco)?preco:0), ativo, aliases } };
}

async function readFileAsText(file){
  const buf = await file.arrayBuffer();
  const dec = new TextDecoder('utf-8');
  return dec.decode(buf);
}

async function parseFile(file){
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) {
    const txt = await readFileAsText(file);
    const arr = JSON.parse(txt);
    if (!Array.isArray(arr)) throw new Error('JSON deve ser um array');
    return arr.map(normalizeRow).filter(Boolean);
  }
  if (name.endsWith('.csv')) {
    await ensureXLSX();
    const txt = await readFileAsText(file);
    const wb = XLSX.read(txt, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const arr = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return arr.map(normalizeRow).filter(Boolean);
  }
  // XLSX, XLS…
  await ensureXLSX();
  const data = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const arr = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return arr.map(normalizeRow).filter(Boolean);
}

function injectModal(){
  if (document.getElementById('prodImportModal')) return;
  const html = `
    <div id="prodImportModal" class="modal hidden">
      <div class="modal-backdrop" data-close="1"></div>
      <div class="modal-card" role="dialog" aria-modal="true" style="max-width:720px">
        <div class="modal-header">
          <h3>Importar Produtos</h3>
          <button class="modal-close" data-close="1" aria-label="Fechar">×</button>
        </div>
        <div class="modal-body">
          <div class="field-group">
            <label>Planilha (XLSX/CSV/JSON):</label>
            <input id="pi_arquivo" type="file" accept=".xlsx,.xls,.csv,.json" />
            <small>Colunas recomendadas: <b>nome</b>, <b>preco</b>, <b>unidade</b>, <b>aliases</b> (opcional), <b>ativo</b>.</small>
          </div>
          <div class="field-group">
            <label>Destino no Firestore:</label>
            <select id="pi_destino">
              <option value="produtos">tenants/{tenantId}/produtos</option>
              <option value="config/produtos">tenants/{tenantId}/config/produtos</option>
            </select>
            <small>ID do doc = nome normalizado (evita duplicação). Operação é <i>upsert</i> (merge).</small>
          </div>
          <div id="pi_preview" class="muted" style="max-height:200px; overflow:auto; border:1px solid #e2e8f0; padding:8px; display:none"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close="1">Cancelar</button>
          <button class="btn-primary" id="pi_btnImportar" disabled>Importar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function openModal(){
  injectModal();
  document.getElementById('prodImportModal').classList.remove('hidden');
}

function closeModal(){
  const m = document.getElementById('prodImportModal');
  if (m) m.classList.add('hidden');
}

async function doImport(rows){
  const tenantId = await getTenantId();
  const dest = (document.getElementById('pi_destino')?.value || 'produtos');
  const baseCol = collection(db, 'tenants', tenantId, ...dest.split('/'));

  let ok = 0, fail = 0;
  for (const r of rows) {
    try {
      const ref = doc(baseCol, r.id);
      await setDoc(ref, { ...r.data, updatedAt: serverTimestamp() }, { merge: true });
      ok++;
    } catch { fail++; }
  }
  alert(`Importação concluída: ${ok} ok • ${fail} falhas`);
}

function wire(){
  // fechar
  document.body.addEventListener('click', (ev)=>{
    if (ev.target?.dataset?.close) closeModal();
  });

  // pré-visualização + habilitar botão
  document.body.addEventListener('change', async (ev)=>{
    if (ev.target?.id !== 'pi_arquivo') return;
    const file = ev.target.files?.[0];
    const prev = document.getElementById('pi_preview');
    const btn  = document.getElementById('pi_btnImportar');
    if (!file) { prev.style.display='none'; btn.disabled=true; return; }
    try{
      const rows = await parseFile(file);
      ev.target._rows = rows;
      prev.style.display='block';
      prev.innerHTML = `<pre style="margin:0; white-space:pre-wrap">${rows.slice(0,30).map(r=>JSON.stringify(r.data)).join('\n')}</pre>`;
      btn.disabled = rows.length === 0;
    }catch(e){
      alert('Falha ao ler arquivo: ' + (e?.message||e));
      prev.style.display='none'; btn.disabled=true;
    }
  });

  // importar
  document.body.addEventListener('click', async (ev)=>{
    if (ev.target?.id !== 'pi_btnImportar') return;
    const input = document.getElementById('pi_arquivo');
    const rows = input?._rows || [];
    if (!rows.length) { alert('Selecione um arquivo válido.'); return; }
    ev.target.disabled = true;
    try { await doImport(rows); closeModal(); }
    finally { ev.target.disabled = false; }
  });
}

export function setupProdutosImportUI(){
  injectModal();
  wire();

  // abrir por hash (#importar-produtos) ou atalho (Ctrl+Alt+P)
  if (location.hash === '#importar-produtos') openModal();
  document.addEventListener('keydown', (e)=>{
    if ((e.ctrlKey || e.metaKey) && e.altKey && String(e.key).toLowerCase() === 'p'){
      e.preventDefault(); openModal();
    }
  });

  // expõe global opcional
  window.openProdutosImport = openModal;
}