// /app/pedidos/js/produtos-import.js
// Importador de produtos: lê XLSX/CSV/JSON e grava em tenants/{tenantId}/produtos/{NOME}
// Usa File API (input type=file) e integra com Firestore multi-tenant da Unikor

import { db, getTenantId, auth } from './firebase.js';
import {
  collection, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Import dinâmico para XLSX (evita carregar sempre)
async function importarXLSX(file) {
  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.19.3/package/xlsx.mjs");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const first = workbook.SheetNames[0];
  const sheet = workbook.Sheets[first];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

// Import CSV básico
async function importarCSV(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map(l => l.split(';').map(c => c.trim()));
  const headers = lines.shift().map(h => h.toUpperCase());
  return lines.filter(l => l.some(x=>x)).map(l => {
    const obj = {};
    headers.forEach((h,i)=>obj[h] = l[i]);
    return obj;
  });
}

// Import JSON direto
async function importarJSON(file) {
  const txt = await file.text();
  return JSON.parse(txt);
}

/* =============== SALVAR NO FIRESTORE =============== */
async function salvarProdutosFirestore(rows) {
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error('Tenant não identificado (usuário não autenticado).');

  const colRef = collection(db, 'tenants', tenantId, 'produtos');
  const uid = auth?.currentUser?.uid || null;

  let count = 0;
  for (const r of rows) {
    const nome = (r.NOME || r.nome || '').trim().toUpperCase();
    if (!nome) continue;
    const precoRaw = String(r.PRECO || r.preco || '').replace(',', '.');
    const preco = parseFloat(precoRaw);
    if (!isFinite(preco)) continue;

    const unidade = (r.UNIDADE || r.unidade || 'KG').trim().toUpperCase();
    const aliases = (r.ALIASES || r['OUTROS NOMES'] || '').split(/[;,|]/).map(x=>x.trim()).filter(Boolean);
    const ativo = String(r.ATIVO || r.ativo || 'TRUE').toUpperCase() !== 'FALSE';

    const payload = {
      tenantId,
      nome,
      preco,
      unidade,
      aliases,
      ativo,
      updatedAt: serverTimestamp(),
      updatedBy: uid
    };

    await setDoc(doc(colRef, nome), payload, { merge: true });
    count++;
  }
  return count;
}

/* =============== UI =============== */
export function setupProdutosImportUI() {
  const idBtn = 'importar-produtos';
  if (document.getElementById(idBtn)) return;

  const btn = document.createElement('button');
  btn.id = idBtn;
  btn.textContent = 'Importar Produtos';
  btn.className = 'btn';
  btn.style.position = 'fixed';
  btn.style.bottom = '18px';
  btn.style.right = '18px';
  btn.style.zIndex = '9999';
  btn.style.background = '#1e7f46';
  btn.style.color = '#fff';
  btn.style.fontWeight = 'bold';
  btn.style.border = 'none';
  btn.style.borderRadius = '6px';
  btn.style.padding = '10px 14px';
  btn.style.cursor = 'pointer';
  btn.title = 'Importar produtos da planilha para este tenant';
  document.body.appendChild(btn);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.csv,.json';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      let rows = [];
      if (file.name.endsWith('.xlsx')) rows = await importarXLSX(file);
      else if (file.name.endsWith('.csv')) rows = await importarCSV(file);
      else if (file.name.endsWith('.json')) rows = await importarJSON(file);
      else throw new Error('Formato de arquivo não suportado.');

      const count = await salvarProdutosFirestore(rows);
      alert(`✅ Importação concluída com sucesso!\n${count} produtos salvos em ${await getTenantId()}.`);
    } catch (e) {
      console.error('[ImportarProdutos]', e);
      alert(`❌ Erro ao importar: ${e.message}`);
    } finally {
      input.value = '';
    }
  });

  // clique direto ou atalho (Ctrl+Alt+P)
  btn.addEventListener('click', () => input.click());
  window.addEventListener('keydown', (ev)=>{
    if (ev.ctrlKey && ev.altKey && ev.key.toUpperCase()==='P') input.click();
  });

  console.log('[ProdutosImport] módulo pronto.');
}