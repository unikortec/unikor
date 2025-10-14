// app/pedidos/js/clientes-autofill.js
// Página principal: preenche cadastro do cliente automaticamente e
// mantém o cadastro atualizado quando os campos mudam.
// NÃO requer alterar o modal.

const DEBOUNCE_MS = 300;

/* ===================== Utils ===================== */
function up(s){ return String(s||'').trim().toUpperCase(); }
function digitsOnly(v){ return String(v||'').replace(/\D/g,''); }

function debounce(fn, ms=DEBOUNCE_MS){
  let t=null;
  return (...args)=>{
    clearTimeout(t);
    t=setTimeout(()=>fn(...args), ms);
  };
}

function ensureHiddenClienteId(){
  let el = document.getElementById('clienteId');
  if (!el){
    const form = document.getElementById('formPedido') || document.querySelector('form') || document.body;
    el = document.createElement('input');
    el.type = 'hidden';
    el.id = 'clienteId';
    el.name = 'clienteId';
    form.appendChild(el);
  }
  return el;
}

function getFormRefs(){
  return {
    cliente   : document.getElementById('cliente'),
    endereco  : document.getElementById('endereco'),
    cnpj      : document.getElementById('cnpj'),
    ie        : document.getElementById('ie'),
    cep       : document.getElementById('cep'),
    contato   : document.getElementById('contato'),
    clienteId : ensureHiddenClienteId(),
    overlay   : document.getElementById('appOverlay'),
  };
}

/* ===================== API mínima (sem mexer nos outros arquivos) ===================== */
// Tenta buscar cliente pelo nome (endpoint /api/tenant-clientes/find)
async function apiFindClienteByName(nome){
  if (!nome) return null;
  try{
    const r = await fetch(`/api/tenant-clientes/find?nome=${encodeURIComponent(nome)}`, { method:'GET' });
    if (!r.ok) return null;
    const j = await r.json();
    // esperado: { ok:true, cliente:{ id, nome, endereco, cnpj, ie, cep, contato } } ou null
    return j?.cliente || null;
  }catch{ return null; }
}

// Cria/atualiza (upsert) cadastro do cliente (endpoint /api/tenant-clientes/create)
async function apiUpsertCliente(payload){
  try{
    const r = await fetch(`/api/tenant-clientes/create`,{
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) return null;
    const j = await r.json();
    // esperado: { ok:true, id, cliente:{...} }
    return j || null;
  }catch{ return null; }
}

/* ===================== Estado local ===================== */
const state = {
  lastLoaded: null,   // snapshot do que veio do backend (para detectar mudanças)
  loading: false,
};

/* ===================== Autofill ===================== */
async function aplicarClienteNoForm(info){
  const refs = getFormRefs();
  const setIf = (el, v)=>{ if (el) el.value = v ?? ''; };

  setIf(refs.endereco, info?.endereco || '');
  setIf(refs.cnpj,     info?.cnpj     || '');
  setIf(refs.ie,       info?.ie       || '');
  setIf(refs.cep,      info?.cep      || '');
  setIf(refs.contato,  info?.contato  || '');

  refs.clienteId.value = info?.id || info?._id || info?.clienteId || '';

  // guarda snapshot para comparar depois no autosave
  state.lastLoaded = {
    nome    : up(refs.cliente?.value || info?.nome || ''),
    endereco: up(refs.endereco?.value || ''),
    cnpj    : digitsOnly(refs.cnpj?.value || ''),
    ie      : up(refs.ie?.value || ''),
    cep     : digitsOnly(refs.cep?.value || ''),
    contato : digitsOnly(refs.contato?.value || ''),
    id      : refs.clienteId.value || ''
  };
}

async function carregarAutofill(nomeOpt){
  const refs = getFormRefs();
  const nome = up(nomeOpt ?? refs.cliente?.value || '');
  if (!nome) return;

  try{
    state.loading = true;
    refs.overlay && refs.overlay.classList.remove('hidden');

    // 1) tenta backend
    const info = await apiFindClienteByName(nome);

    // 2) aplica se achou, senão apenas limpa id e mantém o que o usuário digitou
    if (info){
      await aplicarClienteNoForm(info);
    }else{
      refs.clienteId.value = '';
      // snapshot mínimo para permitir autosave do que o usuário digitar
      state.lastLoaded = {
        nome,
        endereco: up(refs.endereco?.value || ''),
        cnpj    : digitsOnly(refs.cnpj?.value || ''),
        ie      : up(refs.ie?.value || ''),
        cep     : digitsOnly(refs.cep?.value || ''),
        contato : digitsOnly(refs.contato?.value || ''),
        id      : ''
      };
    }
  }finally{
    state.loading = false;
    refs.overlay && refs.overlay.classList.add('hidden');
  }
}

/* ===================== Autosave de cadastro ===================== */
async function salvarSeMudou(){
  const refs = getFormRefs();
  const nome = up(refs.cliente?.value || '');
  if (!nome) return;

  const curr = {
    id      : refs.clienteId.value || null,
    nome,
    endereco: up(refs.endereco?.value || ''),
    cnpj    : digitsOnly(refs.cnpj?.value || ''),
    ie      : up(refs.ie?.value || ''),
    cep     : digitsOnly(refs.cep?.value || ''),
    contato : digitsOnly(refs.contato?.value || ''),
  };

  // Se nada mudou desde o lastLoaded, não envia
  const prev = state.lastLoaded || {};
  const changed = (
    up(prev.nome||'')      !== curr.nome       ||
    up(prev.endereco||'')  !== curr.endereco   ||
    String(prev.cnpj||'')  !== curr.cnpj       ||
    up(prev.ie||'')        !== curr.ie         ||
    String(prev.cep||'')   !== curr.cep        ||
    String(prev.contato||'')!== curr.contato
  );
  if (!changed) return;

  // Upsert
  const res = await apiUpsertCliente(curr);
  if (res?.ok){
    // atualiza id (se foi criação) e snapshot
    if (res.id && !refs.clienteId.value) refs.clienteId.value = res.id;
    await aplicarClienteNoForm(res.cliente || curr);
  }
}

/* ===================== Wiring de eventos ===================== */
function wire(){
  const refs = getFormRefs();
  if (!refs.cliente) return;

  // 1) Autofill no carregamento, se já vier preenchido (clientes antigos)
  if ((refs.cliente.value || '').trim()){
    carregarAutofill(refs.cliente.value);
  }

  // 2) Ao confirmar a escolha (change) → puxa cadastro
  refs.cliente.addEventListener('change', () => {
    const v = up(refs.cliente.value || '');
    if (v) carregarAutofill(v);
  });

  // 3) Enquanto digita (input, com debounce) → tenta achar e preencher
  refs.cliente.addEventListener('input', debounce(()=>{
    const v = up(refs.cliente.value || '');
    if (v) carregarAutofill(v);
  }));

  // 4) Campos que, se alterados, devem atualizar o cadastro
  const saveFields = [refs.endereco, refs.cnpj, refs.ie, refs.cep, refs.contato];
  saveFields.forEach(el=>{
    if (!el) return;
    el.addEventListener('blur', salvarSeMudou);
    el.addEventListener('input', debounce(salvarSeMudou));
  });
}

document.addEventListener('DOMContentLoaded', wire);
