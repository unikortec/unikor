// /app/pedidos/js/produtos-import.js
// Importa catálogo de produtos (CSV/JSON) para Firestore em:
//      tenants/{tenantId}/produtos
// Observação: XLSX não é suportado nativamente; exporte como CSV do Excel.

import {
  db, getTenantId,
  collection, doc, writeBatch, serverTimestamp
} from './firebase.js';

// UI mínima: tecla de atalho e <input type=file> oculto ---------------------
export function setupProdutosImportUI() {
  // cria input file escondido uma única vez
  if (!document.getElementById('prodImportInput')) {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'prodImportInput';
    input.accept = '.csv,application/json,.json,text/csv';
    input.style.display = 'none';
    input.addEventListener('change', onFilePicked);
    document.body.appendChild(input);
  }

  // atalho Ctrl+Alt+P para abrir seletor
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.altKey && ev.key.toLowerCase() === 'p') {
      ev.preventDefault();
      document.getElementById('prodImportInput').click();
    }
  });

  // hash #importar-produtos também abre
  if (location.hash === '#importar-produtos') {
    setTimeout(() => document.getElementById('prodImportInput').click(), 200);
  }

  console.log('[ProdutosImport] pronto.');
}

// Leitura do arquivo ----------------------------------------------------------
async function onFilePicked(e) {
  const file = e.target.files?.[0];
  e.target.value = ''; // permite re-escolher o mesmo arquivo depois
  if (!file) return;

  try {
    let rows = [];
    if (file.name.toLowerCase().endsWith('.csv')) {
      const txt = await file.text();
      rows = parseCSV(txt);
    } else if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
      rows = JSON.parse(await file.text());
      if (!Array.isArray(rows)) throw new Error('JSON deve conter um array de objetos.');
    } else {
      alert('Formato não suportado. Exporte sua planilha como CSV ou JSON.');
      return;
    }

    const norm = normalizeRows(rows);
    if (!norm.length) { alert('Nenhum produto válido encontrado.'); return; }

    const { written, skipped } = await writeProducts(norm);
    alert(`Importação concluída.\nGravados: ${written}\nIgnorados: ${skipped}`);
  } catch (err) {
    console.error('[ProdutosImport] Falha:', err);
    alert('Erro ao importar produtos: ' + (err?.message || err));
  }
}

// Parser CSV simples (separador ; ou ,) --------------------------------------
function parseCSV(text) {
  // suporta ; ou ,; remove BOM; quebra por linhas
  const raw = text.replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length === 0) return [];
  const sep = (lines[0].includes(';') && !lines[0].includes(',')) ? ';' : ',';

  // cabeçalhos
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], sep);
    const obj = {};
    headers.forEach((h, ix) => obj[h] = (cols[ix] ?? '').trim());
    out.push(obj);
  }
  return out;
}
function splitCSVLine(line, sep) {
  // separa respeitando aspas
  const res = [];
  let cur = '', inQ = false;
  for (let i=0;i<line.length;i++){
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === sep && !inQ) {
      res.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  res.push(cur);
  return res;
}

// Normalização de linhas ------------------------------------------------------
function normalizeRows(rows) {
  // aceita cabeçalhos variados: produto / descrição, unidade / tipo / un, preço / preco
  const pick = (o, keys) => {
    for (const k of keys) { const v = o[k]; if (v != null && v !== '') return v; }
    return '';
  };
  const toNum = (v) => {
    const s = String(v ?? '').trim().replace(/\./g,'').replace(',','.');
    const n = Number(s);
    return isFinite(n) ? n : 0;
  };
  const toUpper = (s) => String(s || '').trim().toUpperCase();

  const norm = [];
  for (const r of rows) {
    const lowerObj = {};
    Object.keys(r).forEach(k => lowerObj[k.toLowerCase()] = r[k]);

    const nome   = toUpper(pick(lowerObj, ['produto','descrição','descricao','nome']));
    const un     = toUpper(pick(lowerObj, ['unidade','tipo','un']));
    const preco  = toNum(pick(lowerObj, ['preço','preco','valor','preco_unit','preço_unit']));
    if (!nome) continue;

    norm.push({
      id: idFromName(nome),        // docId padronizado pelo nome
      nome,
      unidade: (un || 'KG'),
      preco: +(preco.toFixed(2)),
      updatedAt: new Date().toISOString()
    });
  }
  return norm;
}

function idFromName(nomeUpper) {
  return nomeUpper
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')  // sem acentos
    .replace(/[^A-Z0-9]+/gi, '_')                    // separadores
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

// Escrita em lote no tenant logado -------------------------------------------
async function writeProducts(items) {
  const tenantId = await getTenantId();                    // 🔒 sempre no tenant atual
  const colRef = collection(db, 'tenants', tenantId, 'produtos');

  let written = 0, skipped = 0;
  // Firestore: máximo ~500 por batch; usaremos 400 por segurança
  const CHUNK = 400;

  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db);
    const slice = items.slice(i, i + CHUNK);

    slice.forEach(it => {
      // merge = atualiza se já existir; cria se não existir
      batch.set(doc(colRef, it.id), {
        nomeUpper: it.nome,
        unidade: it.unidade,
        preco: it.preco,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

    await batch.commit();
    written += slice.length;
  }

  return { written, skipped };
}