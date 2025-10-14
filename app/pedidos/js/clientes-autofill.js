// app/pedidos/js/clientes-autofill.js
// Página principal: sugere clientes conforme digitação (datalist)
// e só preenche o cadastro quando o usuário escolhe um cliente.
// Mantém upsert do cadastro quando campos mudam.

import { getTenantId } from './firebase.js';

const DEBOUNCE_MS = 250;

/* ===================== Utils ===================== */
const up = (s) => String(s || '').trim().toUpperCase();
const digitsOnly = (v) => String(v || '').replace(/\D/g, '');
const debounce = (fn, ms = DEBOUNCE_MS) => {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

function ensureHiddenClienteId() {
  let el = document.getElementById('clienteId');
  if (!el) {
    const form = document.getElementById('formPedido') || document.querySelector('form') || document.body;
    el = document.createElement('input');
    el.type = 'hidden';
    el.id = 'clienteId';
    el.name = 'clienteId';
    form.appendChild(el);
  }
  return el;
}

function ensureDatalist() {
  let dl = document.getElementById('clientesList');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'clientesList';
    document.body.appendChild(dl);
  }
  const input = document.getElementById('cliente');
  if (input && input.getAttribute('list') !== 'clientesList') {
    input.setAttribute('list', 'clientesList');
  }
  return dl;
}

function getRefs() {
  return {
    cliente: document.getElementById('cliente'),
    endereco: document.getElementById('endereco'),
    cnpj: document.getElementById('cnpj'),
    ie: document.getElementById('ie'),
    cep: document.getElementById('cep'),
    contato: document.getElementById('contato'),
    overlay: document.getElementById('appOverlay'),
    clienteId: ensureHiddenClienteId(),
    datalist: ensureDatalist(),
  };
}

/* ===================== Estado ===================== */
const state = {
  // último conjunto de sugestões mostradas ({ id, nome })
  suggestions: [],
  // último snapshot aplicado (para autosave)
  lastLoaded: null,
  loading: false,
};

/* ===================== API ===================== */
// /api/tenant-clientes/top  → POST { tenantId, q, limit } -> { ok, items:[{id, nome}] }
async function apiTopClientes(q, limit = 8) {
  if (!q) return [];
  try {
    const tenantId = await getTenantId();
    const r = await fetch('/api/tenant-clientes/top', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, q, limit }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j?.items) ? j.items : [];
  } catch {
    return [];
  }
}

// /api/tenant-clientes/find → POST { tenantId, nome } -> { ok, found, id, data }
async function apiFindByName(nome) {
  if (!nome) return null;
  try {
    const tenantId = await getTenantId();
    const r = await fetch('/api/tenant-clientes/find', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, nome }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.ok && j.found && j.id && j.data) return { id: j.id, ...j.data };
    return null;
  } catch {
    return null;
  }
}

// /api/tenant-clientes/create → POST { tenantId, cliente } -> { ok, id }
async function apiUpsertCliente(payload) {
  try {
    const tenantId = await getTenantId();
    const r = await fetch('/api/tenant-clientes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, cliente: payload }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.ok) return { ok: true, id: j.id, cliente: { ...payload, id: j.id } };
    return null;
  } catch {
    return null;
  }
}

/* ===================== UI helpers ===================== */
function fillDatalist(items) {
  const { datalist } = getRefs();
  datalist.innerHTML = ''; // limpa
  for (const it of items) {
    const opt = document.createElement('option');
    // value é o que vai para o input quando selecionado
    opt.value = up(it.nome || '');
    datalist.appendChild(opt);
  }
  state.suggestions = items.map((i) => ({ id: i.id, nome: up(i.nome || '') }));
}

function findSuggestionByName(nomeUp) {
  return state.suggestions.find((s) => s.nome === up(nomeUp));
}

/* ===================== Aplicar cliente no formulário ===================== */
async function aplicarCliente(info) {
  const refs = getRefs();
  const setIf = (el, v) => { if (el) el.value = v ?? ''; };

  setIf(refs.endereco, info?.endereco || '');
  setIf(refs.cnpj, info?.cnpj || '');
  setIf(refs.ie, info?.ie || '');
  setIf(refs.cep, info?.cep || '');
  setIf(refs.contato, info?.contato || '');

  refs.clienteId.value = info?.id || info?._id || info?.clienteId || '';

  state.lastLoaded = {
    id: refs.clienteId.value || '',
    nome: up(refs.cliente?.value || info?.nome || ''),
    endereco: up(refs.endereco?.value || ''),
    cnpj: digitsOnly(refs.cnpj?.value || ''),
    ie: up(refs.ie?.value || ''),
    cep: digitsOnly(refs.cep?.value || ''),
    contato: digitsOnly(refs.contato?.value || ''),
  };
}

/* ===================== Fluxos ===================== */
// 1) Enquanto digita: só sugere (não preenche)
const onTypeSuggest = debounce(async () => {
  const { cliente, overlay } = getRefs();
  const q = up(cliente?.value || '');
  if (!q) {
    fillDatalist([]);
    return;
  }
  try {
    state.loading = true;
    overlay && overlay.classList.remove('hidden');
    const items = await apiTopClientes(q, 8);
    fillDatalist(items);
  } finally {
    state.loading = false;
    overlay && overlay.classList.add('hidden');
  }
}, DEBOUNCE_MS);

// 2) Quando o usuário ESCOLHE (change): preenche
async function onChooseCliente() {
  const refs = getRefs();
  const nomeEscolhido = up(refs.cliente?.value || '');
  if (!nomeEscolhido) {
    refs.clienteId.value = '';
    return;
  }

  // tenta casar com uma sugestão visível (nome exato)
  const sug = findSuggestionByName(nomeEscolhido);

  // se casou com sugestão, preenche pelo id; senão tenta um find exato no servidor
  let info = null;
  try {
    refs.overlay && refs.overlay.classList.remove('hidden');
    if (sug?.id) {
      // como não temos endpoint "get by id", chamamos o find por nome mesmo (nome veio da sugestão)
      info = await apiFindByName(nomeEscolhido);
      if (!info && sug.id) {
        // fallback: pelo menos garanta o id
        info = { id: sug.id, nome: nomeEscolhido };
      }
    } else {
      // usuário digitou inteiro sem abrir a lista -> tenta find exato
      info = await apiFindByName(nomeEscolhido);
    }

    if (info) await aplicarCliente(info);
    else {
      // não existe cadastro exato — apenas zera o id, deixa usuário seguir
      refs.clienteId.value = '';
      state.lastLoaded = null;
    }
  } finally {
    refs.overlay && refs.overlay.classList.add('hidden');
  }
}

// 3) Autosave do cadastro quando campos mudam
async function salvarSeMudou() {
  const refs = getRefs();
  const nome = up(refs.cliente?.value || '');
  if (!nome) return;

  const curr = {
    id: refs.clienteId.value || null,
    nome,
    endereco: up(refs.endereco?.value || ''),
    cnpj: digitsOnly(refs.cnpj?.value || ''),
    ie: up(refs.ie?.value || ''),
    cep: digitsOnly(refs.cep?.value || ''),
    contato: digitsOnly(refs.contato?.value || ''),
  };

  const prev = state.lastLoaded || {};
  const changed = (
    up(prev.nome || '') !== curr.nome ||
    up(prev.endereco || '') !== curr.endereco ||
    String(prev.cnpj || '') !== curr.cnpj ||
    up(prev.ie || '') !== curr.ie ||
    String(prev.cep || '') !== curr.cep ||
    String(prev.contato || '') !== curr.contato
  );
  if (!changed) return;

  const res = await apiUpsertCliente(curr);
  if (res?.ok) {
    if (res.id && !refs.clienteId.value) refs.clienteId.value = res.id;
    await aplicarCliente(res.cliente || curr);
  }
}

/* ===================== Inicialização ===================== */
function wire() {
  const refs = getRefs();
  if (!refs.cliente) return;

  // Se já existir clienteId (ex.: pedido carregado), preenche; caso contrário, não auto-preenche.
  if (refs.clienteId.value) {
    apiFindByName(up(refs.cliente.value || '')).then((info) => { if (info) aplicarCliente(info); });
  }

  // Enquanto digita: só sugestões
  refs.cliente.addEventListener('input', onTypeSuggest);

  // Quando confirma (seleciona no datalist ou sai do campo): preenche
  refs.cliente.addEventListener('change', onChooseCliente);
  refs.cliente.addEventListener('blur', onChooseCliente);

  // Campos que salvam cadastro quando mudam
  [refs.endereco, refs.cnpj, refs.ie, refs.cep, refs.contato].forEach((el) => {
    if (!el) return;
    el.addEventListener('blur', salvarSeMudou);
    el.addEventListener('input', debounce(salvarSeMudou, 400));
  });
}

document.addEventListener('DOMContentLoaded', wire);
