// /app/pedidos/js/clientes-autofill.js
import {
  getTenantId, waitForLogin,
  collection, query, orderBy, startAt, endAt, limit, getDocs
} from './firebase.js';
import { up } from './utils.js';
import { buscarClienteInfo, salvarCliente } from './clientes.js';

const QTD_SUGESTOES = 20;
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

async function buscarSugestoes(prefixUpper){
  const tenantId = await getTenantId();
  const col = collection(window.db, 'tenants', tenantId, 'clientes');
  const q = query(
    col,
    orderBy('clienteUpper'),
    startAt(prefixUpper),
    endAt(prefixUpper + '\uf8ff'),
    limit(QTD_SUGESTOES)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data() || {};
    return (data.clienteUpper || data.nomeUpper || d.id || '').toString();
  }).filter(Boolean);
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
  }catch(e){ console.warn('[autofill] falha ao buscar sugestões:', e?.message || e); }
}

/**
 * Preenche o formulário e garante que o cliente exista com id=nomeUpper.
 */
async function preencherFormularioCom(nomeDigitado){
  const nome = up(nomeDigitado || '');
  if (!nome) return;

  try{
    // busca info
    const info = await buscarClienteInfo(nome);

    // preenche campos
    const setVal = (id, val) => { const e=document.getElementById(id); if(e) e.value=val||''; };
    if (info) {
      setVal('endereco', info.endereco?.toUpperCase());
      setVal('cnpj', info.cnpj);
      setVal('ie', info.ie);
      setVal('cep', info.cep);
      setVal('contato', info.contato);
    }

    // garante existência no banco (salva se não existir)
    const { id } = await salvarCliente(nome, info?.endereco || '', info?.isentoFrete, info);
    const hiddenId = document.getElementById('clienteId');
    if (hiddenId) hiddenId.value = id;

  }catch(e){
    console.warn('[autofill] erro ao preencher formulário:', e?.message || e);
  }
}

const debouncedInput = debounce(onClienteInput, 200);

document.addEventListener('DOMContentLoaded', async () => {
  await waitForLogin();

  const inp = document.getElementById('cliente');
  if (inp){
    inp.addEventListener('input', debouncedInput);
    inp.addEventListener('change', () => preencherFormularioCom(inp.value));
    inp.addEventListener('blur',   () => preencherFormularioCom(inp.value));
  }

  // primeiro load
  debouncedInput();
});