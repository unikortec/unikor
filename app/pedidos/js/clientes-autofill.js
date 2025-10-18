// app/pedidos/js/clientes-autofill.js
import {
  db, getTenantId, waitForLogin,
  collection, query, orderBy, startAt, endAt, limit, getDocs
} from './firebase.js';
import { up, digitsOnly } from './utils.js';
import { buscarClienteInfo } from './clientes.js';
import { setFreteSugestao, atualizarFreteUI } from './frete.js';

const QTD_SUGESTOES = 20;

function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

async function buscarSugestoes(prefixUpper){
  const tenantId = await getTenantId();
  const col = collection(db, 'tenants', tenantId, 'clientes');
  const q = query(
    col,
    orderBy('clienteUpper'),
    startAt(prefixUpper),
    endAt(prefixUpper + '\uf8ff'),
    limit(QTD_SUGESTOES)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.id); // id é o próprio clienteUpper
}

function preencherDatalist(nomes){
  const dl = document.getElementById('listaClientes');
  if (!dl) return;
  dl.innerHTML = '';
  nomes.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    dl.appendChild(opt);
  });
}

async function onClienteInput(){
  const el = document.getElementById('cliente');
  if (!el) return;
  const raw = (el.value || '').trim();
  if (!raw) { preencherDatalist([]); return; }
  const prefix = up(raw);
  try{
    const nomes = await buscarSugestoes(prefix);
    preencherDatalist(nomes);
  }catch(e){
    console.warn('[autofill] falha ao buscar sugestões:', e?.message || e);
  }
}

async function preencherFormularioCom(nomeDigitado){
  const nome = up(nomeDigitado || '');
  if (!nome) return;

  try{
    const info = await buscarClienteInfo(nome); // lê do Firestore por doc-id (UPPER)
    if (!info) return;

    // Endereço
    const end = document.getElementById('endereco'); if (end) end.value = (info.endereco||'').toUpperCase();

    // CNPJ/IE/CEP/Contato
    const cnpj = document.getElementById('cnpj');     if (cnpj) cnpj.value = info.cnpj || '';
    const ie   = document.getElementById('ie');       if (ie)   ie.value   = info.ie   || '';
    const cep  = document.getElementById('cep');      if (cep)  cep.value  = info.cep  || '';
    const tel  = document.getElementById('contato');  if (tel)  tel.value  = info.contato || '';

    // Frete: se isento, marca; senão, coloca valor no frete manual como sugestão
    const chkIsento = document.getElementById('isentarFrete');
    const freteMan  = document.getElementById('freteManual');

    if (chkIsento) chkIsento.checked = !!info.isentoFrete;

    if (!info.isentoFrete && freteMan){
      const v = Number(info.frete || 0);
      freteMan.value = v ? String(v.toFixed(2)).replace('.', ',') : '';
    }

    // Sinaliza ao módulo de frete para esconder input manual se tiver sugestão
    setFreteSugestao(info.isentoFrete ? 0 : Number(info.frete || 0));

    // Atualiza exibição do frete na UI
    atualizarFreteUI();

  }catch(e){
    console.warn('[autofill] erro ao preencher formulário:', e?.message || e);
  }
}

const debouncedInput = debounce(onClienteInput, 180);

document.addEventListener('DOMContentLoaded', async () => {
  await waitForLogin();

  const inp = document.getElementById('cliente');
  if (inp){
    // Quando digitar, buscamos sugestões
    inp.addEventListener('input', debouncedInput);

    // Ao sair do campo ou confirmar um valor da lista, preenche o restante do formulário
    inp.addEventListener('change', () => preencherFormularioCom(inp.value));
    inp.addEventListener('blur',   () => preencherFormularioCom(inp.value));
  }

  // Primeira carga (se já vier com algo digitado via restore)
  debouncedInput();
});