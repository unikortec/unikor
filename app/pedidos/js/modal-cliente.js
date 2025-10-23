// app/pedidos/js/clientes-autofill.js
// Sugestões enquanto digita (une clienteUpper e nomeUpper) + preenche formulário
// e garante que o cliente exista com id=nomeUpper (sem duplicar).

import {
  db, getTenantId, waitForLogin,
  collection, query, orderBy, startAt, endAt, limit, getDocs, doc, getDoc
} from './firebase.js';
import { up } from './utils.js';
import { buscarClienteInfo, salvarCliente } from './clientes.js';

const QTD_SUGESTOES = 20;
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

/** Busca sugestões em dois índices: clienteUpper e nomeUpper (legado). */
async function buscarSugestoes(prefixUpper){
  const tenantId = await getTenantId();
  const col = collection(db, 'tenants', tenantId, 'clientes');

  const qA = query(
    col, orderBy('clienteUpper'),
    startAt(prefixUpper), endAt(prefixUpper + '\uf8ff'), limit(QTD_SUGESTOES)
  );
  const qB = query(
    col, orderBy('nomeUpper'),
    startAt(prefixUpper), endAt(prefixUpper + '\uf8ff'), limit(QTD_SUGESTOES)
  );

  const [sA, sB] = await Promise.all([getDocs(qA), getDocs(qB)]);
  const nomes = new Set();
  sA.forEach(d => { const x = (d.data()?.clienteUpper || '').toString(); if (x) nomes.add(x); });
  sB.forEach(d => {
    const data = d.data() || {};
    const x = (data.clienteUpper || data.nomeUpper || '').toString();
    if (x) nomes.add(x);
  });

  return Array.from(nomes).slice(0, QTD_SUGESTOES);
}

function preencherDatalist(nomes){
  const dl = document.getElementById('listaClientes');
  if (!dl) return;
  const uniq = Array.from(new Set(nomes));
  dl.innerHTML = '';
  uniq.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    dl.appendChild(opt);
  });
}

async function onClienteInput(){
  const el = document.getElementById('cliente');
  const hiddenId = document.getElementById('clienteId');
  if (!el) return;
  const raw = (el.value || '').trim();
  if (hiddenId && !raw) hiddenId.value = '';

  if (!raw) { preencherDatalist([]); return; }
  const prefix = up(raw);
  try{
    const nomes = await buscarSugestoes(prefix);
    preencherDatalist(nomes);
  }catch(e){
    console.warn('[autofill] falha ao buscar sugestões:', e?.message || e);
  }
}

/** Preenche o formulário e garante existência com id=nomeUpper (migra se necessário). */
async function preencherFormularioCom(nomeDigitado){
  const nome = up(nomeDigitado || '');
  if (!nome) return;

  try{
    // 1) lê dados (compat com legado)
    const info = await buscarClienteInfo(nome);

    // 2) preenche campos
    const setVal = (id, val) => { const e=document.getElementById(id); if(e) e.value = val || ''; };
    if (info) {
      setVal('endereco', (info.endereco||'').toUpperCase());
      setVal('cnpj', info.cnpj);
      setVal('ie', info.ie);
      setVal('cep', info.cep);
      setVal('contato', info.contato);
    }

    // 3) garante (ou migra) para id=nomeUpper e coloca o id no hidden
    const { id } = await salvarCliente(nome, info?.endereco || '', info?.isentoFrete, info || {});
    const hiddenId = document.getElementById('clienteId');
    if (hiddenId) hiddenId.value = id;

  }catch(e){
    console.warn('[autofill] erro ao preencher formulário:', e?.message || e);
  }
}

const debouncedInput = debounce(onClienteInput, 180);

document.addEventListener('DOMContentLoaded', async () => {
  await waitForLogin();

  const inp = document.getElementById('cliente');
  if (inp){
    inp.addEventListener('input', debouncedInput);
    inp.addEventListener('change', () => preencherFormularioCom(inp.value));
    inp.addEventListener('blur',   () => preencherFormularioCom(inp.value));
  }

  // Primeira carga (se já vier preenchido)
  debouncedInput();
});