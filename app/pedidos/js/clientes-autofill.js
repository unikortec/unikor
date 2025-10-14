// app/pedidos/js/clientes-autofill.js
// Página principal: preenche cadastro do cliente automaticamente e
// mantém o cadastro atualizado quando os campos mudam. NÃO requer alterar o modal.

import { getTenantId } from './firebase.js';

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
    overlay   : document.getElementById('appOverlay')
  };
}

/* ===================== API (POST) ===================== */
// find.js exige POST: { tenantId, nome } → { ok, found, id, data }
async function apiFindClienteByName(nome){
  if (!nome) return null;
  try{
    const tenantId = await getTenantId();
    const r = await fetch(`/api/tenant-clientes/find`,{
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ tenantId, nome })
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.ok && j.found && j.id && j.data) {
      return { id: j.id, ...j.data };
    }
    return null;
  }catch{
    return null;
  }
}

// create.js exige POST: { tenantId, cliente:{...} } → { ok, id, reused? }
async function apiUpsertCliente(payload){
  try{
    const tenantId = await getTenantId();
    const r = await fetch(`/api/tenant-clientes/create`,{
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ tenantId, cliente: payload })
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.ok) {
      // normaliza retorno para termos sempre { ok, id, cliente }
      return { ok:true, id: j.id, cliente: { ...payload, id: j.id } };
    }
    return null;
  }catch{
    return null;
  }
}

/* ===================== Estado local ===================== */
const state = {
  lastLoaded: null,
  loading: false
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
  const nome = up(nomeOpt ?? (refs.cliente?.value || ''));
  if (!nome) return;

  try{
    state.loading = true;
    if (refs.overlay) refs.overlay.classList.remove('hidden');

    const info = await apiFindClienteByName(nome);
    if (info){
      await aplicarClienteNoForm(info);
    } else {
      refs.clienteId.value = '';
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
  } finally {
    state.loading = false;
    if (refs.overlay) refs.overlay.classList.add('hidden');
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
    contato : digitsOnly(refs.contato?.value || '')
  };

  const prev = state.lastLoaded || {};
  const changed = (
    up(prev.nome||'')       !== curr.nome     ||
    up(prev.endereco||'')   !== curr.endereco ||
    String(prev.cnpj||'')   !== curr.cnpj     ||
    up(prev.ie||'')         !== curr.ie       ||
    String(prev.cep||'')    !== curr.cep      ||
    String(prev.contato||'')!== curr.contato
  );
  if (!changed) return;

  const res = await apiUpsertCliente(curr);
  if (res?.ok){
    if (res.id && !refs.clienteId.value) refs.clienteId.value = res.id;
    await aplicarClienteNoForm(res.cliente || curr);
  }
}

/* ===================== Wiring de eventos ===================== */
function wire(){
  const refs = getFormRefs();
  if (!refs.cliente) return;

  // Autofill no load (clientes antigos já preenchidos)
  if ((refs.cliente.value || '').trim()){
    carregarAutofill(refs.cliente.value);
  }

  // change → puxa cadastro
  refs.cliente.addEventListener('change', () => {
    const v = up(refs.cliente.value || '');
    if (v) carregarAutofill(v);
  });

  // input (debounce) → puxa cadastro enquanto digita
  refs.cliente.addEventListener('input', debounce(() => {
    const v = up(refs.cliente.value || '');
    if (v) carregarAutofill(v);
  }));

  // campos que, ao mudar, disparam upsert
  const saveFields = [refs.endereco, refs.cnpj, refs.ie, refs.cep, refs.contato];
  saveFields.forEach((el)=>{
    if (!el) return;
    el.addEventListener('blur', salvarSeMudou);
    el.addEventListener('input', debounce(salvarSeMudou));
  });
}

document.addEventListener('DOMContentLoaded', wire);
