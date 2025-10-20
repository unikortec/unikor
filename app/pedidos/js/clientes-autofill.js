// app/pedidos/js/clientes-autofill.js
import {
  db, getTenantId, waitForLogin,
  collection, query, orderBy, startAt, endAt, limit, getDocs, doc, getDoc
} from './firebase.js';
import { up } from './utils.js';
import { buscarClienteInfo } from './clientes.js';
// 🔸 sem setFreteSugestao / atualizarFreteUI agora

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
  // Preferimos mostrar o nome (clienteUpper); se for doc legado sem esse campo, mostramos o id mesmo
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
  if (hiddenId && !raw) hiddenId.value = ''; // se apagou o nome, limpa o id
  
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
    const info = await buscarClienteInfo(nome); // tolerante a legado
    if (!info) return;

    // Endereço
    const end = document.getElementById('endereco'); if (end) end.value = (info.endereco||'').toUpperCase();

    // CNPJ/IE/CEP/Contato
    const cnpj = document.getElementById('cnpj');     if (cnpj) cnpj.value = info.cnpj || '';
    const ie   = document.getElementById('ie');       if (ie)   ie.value   = info.ie   || '';
    const cep  = document.getElementById('cep');      if (cep)  cep.value  = info.cep  || '';
    const tel  = document.getElementById('contato');  if (tel)  tel.value  = info.contato || '';

    // 🔸 Não mexer em frete agora (stand by) — não preencher freteManual,
    //     não setar sugestão. UI do frete ficará “—” até definirmos regra.

    // Preenche o clienteId (se existir no DOM)
    const tenantId = await getTenantId();
    const hiddenId = document.getElementById('clienteId');
    if (hiddenId) {
      // tentamos achar o doc real para extrair o id definitivo
      // primeiro: doc com id = nome
      const ref = doc(collection(db, 'tenants', tenantId, 'clientes'), nome);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        hiddenId.value = ref.id;
      } else {
        // fallback: deixa o próprio nome em uppercase (compat)
        hiddenId.value = nome;
      }
    }

  }catch(e){
    console.warn('[autofill] erro ao preencher formulário:', e?.message || e);
  }
}

const debouncedInput = debounce(onClienteInput, 180);

document.addEventListener('DOMContentLoaded', async () => {
  await waitForLogin();

  const inp = document.getElementById('cliente');
  if (inp){
    // Conforme digita: sugestões
    inp.addEventListener('input', debouncedInput);

    // Ao selecionar/confirmar: preenche o formulário
    inp.addEventListener('change', () => preencherFormularioCom(inp.value));
    inp.addEventListener('blur',   () => preencherFormularioCom(inp.value));
  }

  // Primeira carga (se já vier com algo digitado via restore)
  debouncedInput();
});