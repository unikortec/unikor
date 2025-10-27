// /app/pedidos/js/produtos-import.js
//
// Importa uma tabela de produtos (CSV/JSON/XLSX) para
// Firestore em: tenants/{tenantId}/produtos
//
// - Detecta o tenant do usuário logado (getTenantId())
// - Faz upsert (merge) por ID determinístico baseado no nome
//   ou no CODE se houver (para reimportar sem duplicar)
// - Campos aceitos (cabecalhos tolerantes):
//   CODE | CÓDIGO | COD
//   NOME | PRODUTO | DESCRICAO
//   PRECO | PREÇO | PRICE
//   UN | UND | UNIDADE (KG/UN)
//   ATIVO | ACTIVE (true/false/1/0)
//   FAM | FAMILIA | FAMILY (opcional)
//
// Observação: o preço importado é o padrão da tabela.
// No pedido o usuário pode alterar o valor (alteração só no pedido).
//

import {
  db, getTenantId, auth,
  collection, doc, writeBatch, serverTimestamp
} from './firebase.js';

// ========================= UI mínima =========================
export function setupProdutosImportUI() {
  // input file escondido
  let fileInput = document.getElementById('unikorImportProdutos');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx';
    fileInput.id = 'unikorImportProdutos';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }

  fileInput.onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      console.time('[ProdutosImport] total');
      const rows = await parseAnyFile(f);
      const norm = normalizeRows(rows);
      const res  = await importToFirestore(norm);
      alert(`Produtos importados/atualizados: ${res.count}\nFalhas: ${res.errors.length}`);
      if (res.errors.length) console.warn('[ProdutosImport] Erros:', res.errors);
    } catch (err) {
      console.error('[ProdutosImport] Falha:', err);
      alert('Falha ao importar: ' + (err?.message || err));
    } finally {
      e.target.value = ''; // permite escolher o mesmo arquivo de novo
      console.timeEnd('[ProdutosImport] total');
    }
  };

  // Atalho: Ctrl+Alt+P
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.altKey && ev.key.toLowerCase() === 'p') {
      ev.preventDefault(); fileInput.click();
    }
  });

  // Link via hash (#importar-produtos)
  if (location.hash === '#importar-produtos') {
    setTimeout(() => fileInput.click(), 200);
  }

  console.log('[ProdutosImport] módulo pronto.');
}

// ========================= Parser =========================
async function parseAnyFile(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.json')) {
    const txt = await file.text();
    const data = JSON.parse(txt);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.rows)) return data.rows;
    throw new Error('JSON inválido: esperado array ou { rows: [] }');
  }
  if (name.endsWith('.csv')) {
    const txt = await file.text();
    return parseCSV(txt);
  }
  // XLSX (opcional) — requer SheetJS carregado na página (window.XLSX)
  if (name.endsWith('.xlsx') || file.type.includes('spreadsheet')) {
    if (!window.XLSX) throw new Error('Para XLSX, inclua SheetJS (XLSX) na página.');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return rows;
  }
  throw new Error('Formato não suportado. Use CSV, JSON ou XLSX.');
}

function parseCSV(text) {
  // CSV simples (padrão; separador vírgula ou ponto e vírgula)
  const sep = text.includes(';') && !text.includes(',') ? ';' : ',';
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length === 0) return [];
  const header = lines[0].split(sep).map(h => h.trim());
  return lines.slice(1).map(l => {
    const cols = splitCSVLine(l, sep);
    const row = {};
    header.forEach((h, i) => { row[h] = (cols[i] ?? '').trim(); });
    return row;
  });
}
function splitCSVLine(line, sep) {
  // trata campos com aspas
  const out = [];
  let cur = '', inside = false;
  for (let i=0; i<line.length; i++){
    const ch = line[i];
    if (ch === '"') {
      if (inside && line[i+1] === '"'){ cur += '"'; i++; }
      else inside = !inside;
    } else if (ch === sep && !inside) {
      out.push(cur); cur='';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// ========================= Normalização =========================
function normalizeRows(rows) {
  const key = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase().trim();

  const out = [];
  for (const r of rows) {
    // aceita várias grafias
    const nome   = r.NOME ?? r.Produto ?? r.PRODUTO ?? r.DESCRICAO ?? r.Descricao ?? r.descricao ?? r.nome;
    const preco  = r.PRECO ?? r['PREÇO'] ?? r.Price ?? r.PRICE ?? r.preco ?? r.Preco;
    const und    = r.UN ?? r.UND ?? r.UNIDADE ?? r.Unidade ?? r.unidade;
    const ativo  = r.ATIVO ?? r.Active ?? r.ACTIVE ?? r.ativo;
    const code   = r.CODE ?? r.CODIGO ?? r.CÓDIGO ?? r.COD ?? r.cod ?? r.codigo ?? r.Codigo;
    const fam    = r.FAM ?? r.FAMILIA ?? r.Family ?? r.family ?? r.familia;

    const nomeStr = String(nome||'').trim();
    if (!nomeStr) continue;

    const unidade = String(und || 'KG').toUpperCase().startsWith('U') ? 'UN' : 'KG';
    const precoNum = asNumber(preco);
    const ativoBool = asBool(ativo, true);

    const nomeUpper = nomeStr.toUpperCase();
    const id = buildProductId(code, nomeUpper);

    out.push({
      id,
      code: String(code||'').trim() || null,
      nome: nomeUpper,
      nomeUpper, // redundante p/ buscas
      unidade,
      preco: isFinite(precoNum) ? Number(precoNum.toFixed(2)) : 0,
      ativo: !!ativoBool,
      familia: fam ? String(fam).toUpperCase().trim() : null,
      // Campo de busca (nome + code) sem acentos
      search: (key(nomeUpper) + ' ' + (String(code||'').trim())).trim()
    });
  }
  return out;
}

function asNumber(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s+/g,'').replace(/\./g,'').replace(',','.');
  if (!s) return NaN;
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}
function asBool(v, def=false){
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return def;
  if (['1','true','sim','yes','ativo','on'].includes(s)) return true;
  if (['0','false','nao','não','no','off','inativo'].includes(s)) return false;
  return def;
}
function slug(s){
  return String(s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9]+/g,'-')
    .replace(/(^-|-$)/g,'')
    .toLowerCase();
}
function buildProductId(code, nomeUpper) {
  const cod = String(code||'').trim();
  if (cod) return cod;                 // se tem CODE, usamos ele (estável)
  return 'p-' + slug(nomeUpper).slice(0, 60); // senão, slug do nome
}

// ========================= Firestore (tenant-aware) =========================
async function importToFirestore(items) {
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error('Tenant não identificado (login exigido).');

  const col = collection(db, 'tenants', tenantId, 'produtos'); // ✅ 3 segmentos (coleção válida)
  const batch = writeBatch(db);

  let count = 0; const errors = [];
  const now = serverTimestamp();
  const uid = auth?.currentUser?.uid || null;

  for (const it of items) {
    try {
      const ref = doc(col, it.id);
      const payload = {
        tenantId,
        code: it.code || null,
        nome: it.nome,
        nomeUpper: it.nomeUpper,
        unidade: it.unidade,            // 'KG' | 'UN'
        preco: Number(it.preco || 0),   // número
        ativo: !!it.ativo,
        familia: it.familia || null,
        search: it.search,
        updatedAt: now,
        updatedBy: uid
      };
      // created* apenas na criação — server irá manter se já existir
      // (como é batch set com merge:true, não sobrescreve created*)
      batch.set(ref, { ...payload, createdAt: now, createdBy: uid }, { merge: true });
      count++;
      // Commit em blocos de 400 para ficar folgado
      if (count % 400 === 0) await batch.commit();
    } catch (e) {
      errors.push({ id: it.id, error: e?.message || String(e) });
    }
  }

  // commit final (se sobrar)
  try { await batch.commit(); } catch (e) { errors.push({ commit: true, error: e?.message || String(e) }); }

  console.info(`[ProdutosImport] OK -> ${count} itens para tenants/${tenantId}/produtos`);
  return { count, errors };
}