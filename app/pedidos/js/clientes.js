// app/pedidos/js/clientes.js
// Cadastro/lookup de clientes no tenant e modal com autofill protegido.

import { db, authReady, TENANT_ID } from './firebase.js';
import {
  collection, doc, setDoc, addDoc, updateDoc, getDocs, query, where, orderBy, limit,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  up as _up,
  removeAcentos,
  normNome as _normNome,
  digitsOnly as _digitsOnly,
  maskCNPJ, maskCEP, maskTelefone
} from './utils.js';

const up = (s)=>_up(s);
const digitsOnly = (s)=>_digitsOnly(s);
const normNome = (s)=>_normNome(s);

// ---------- paths helpers ----------
function colClientes(){ return collection(db, `tenants/${TENANT_ID}/clientes`); }
function colHistPreco(){ return collection(db, `tenants/${TENANT_ID}/historico_precos`); }

// ---------- lookups ----------
export async function getClienteDocByNome(nomeInput){
  await authReady;
  const alvo = normNome(nomeInput);
  try{
    const q1 = query(colClientes(), where("nomeNormalizado","==",alvo), limit(1));
    const s1 = await getDocs(q1);
    if (!s1.empty) return { id:s1.docs[0].id, ref:s1.docs[0].ref, data:s1.docs[0].data() };
  }catch(_){}
  try{
    const q2 = query(colClientes(), where("nomeUpper","==", up(nomeInput)), limit(1));
    const s2 = await getDocs(q2);
    if (!s2.empty) return { id:s2.docs[0].id, ref:s2.docs[0].ref, data:s2.docs[0].data() };
  }catch(_){}
  try{
    const start = up(nomeInput), end = start + '\uf8ff';
    const q3 = query(colClientes(), orderBy("nome"), where("nome", ">=", start), where("nome", "<=", end), limit(5));
    const s3 = await getDocs(q3);
    if (!s3.empty) return { id:s3.docs[0].id, ref:s3.docs[0].ref, data:s3.docs[0].data() };
  }catch(_){}
  return null;
}

export async function buscarClienteInfo(nomeCliente){
  const found = await getClienteDocByNome(up(nomeCliente));
  if (!found) return null;
  const d = found.data || {};
  return {
    endereco: d.endereco || "",
    isentoFrete: !!d.isentoFrete,
    cnpj: d.cnpj || "",
    ie: d.ie || "",
    cep: d.cep || "",
    contato: d.contato || "",
    lastFrete: typeof d.lastFrete === "number" ? d.lastFrete : null
  };
}

export async function clientesMaisUsados(n=50){
  await authReady;
  const out = [];
  try{
    const qs = await getDocs(query(colClientes(), orderBy("compras","desc"), limit(n)));
    qs.forEach(d=> out.push(d.data()?.nome || d.data()?.nomeUpper || ""));
  }catch(_){
    const qs2 = await getDocs(query(colClientes(), orderBy("nome"), limit(n)));
    qs2.forEach(d=> out.push(d.data()?.nome || d.data()?.nomeUpper || ""));
  }
  return out.filter(Boolean);
}

// ---------- create/update ----------
export async function salvarCliente(nome, endereco, isentoFrete=false, extras={}){
  await authReady;
  const nomeUpper = up(nome);
  const enderecoUpper = up(endereco);
  if (!nomeUpper) return;

  const base = {
    nome: nomeUpper,
    nomeUpper,
    nomeNormalizado: normNome(nome),
    endereco: enderecoUpper,
    isentoFrete: !!isentoFrete,
    cnpj: digitsOnly(extras.cnpj)||"",
    ie: up(extras.ie)||"",
    cep: digitsOnly(extras.cep)||"",
    contato: digitsOnly(extras.contato)||"",
    atualizadoEm: serverTimestamp()
  };

  const exist = await getClienteDocByNome(nomeUpper);
  if (exist) {
    await updateDoc(exist.ref, base);
  } else {
    await addDoc(colClientes(), { ...base, compras:0, criadoEm: serverTimestamp() });
  }
}

export async function buscarUltimoPreco(clienteNome, produtoNome){
  await authReady;
  const nomeCli = up(clienteNome);
  const nomeProd = String(produtoNome||"").trim();
  if (!nomeCli || !nomeProd) return null;
  const qs = await getDocs(query(
    colHistPreco(),
    where("cliente","==",nomeCli),
    where("produto","==",nomeProd),
    orderBy("data","desc"),
    limit(1)
  ));
  if (qs.empty) return null;
  const v = qs.docs[0].data()?.preco;
  return typeof v === "number" ? v : parseFloat(v);
}

export async function registrarPrecoCliente(clienteNome, produtoNome, preco){
  await authReady;
  const nomeCli = up(clienteNome);
  const nomeProd = String(produtoNome||"").trim();
  const valor = parseFloat(preco);
  if (!nomeCli || !nomeProd || isNaN(valor)) return;

  await addDoc(colHistPreco(), {
    cliente: nomeCli, produto: nomeProd, preco: valor, data: serverTimestamp()
  });

  const found = await getClienteDocByNome(nomeCli);
  if (found) await updateDoc(found.ref, { compras: increment(1), atualizadoEm: serverTimestamp() });
}

// ---------- UI helpers (form principal) ----------
function setMainFormFromCliente(d){
  if (!d) return;
  const byId = (id)=>document.getElementById(id);
  if (d.endereco && byId('endereco')) byId('endereco').value = d.endereco;
  if (d.cnpj && byId('cnpj'))         byId('cnpj').value     = d.cnpj;
  if (d.ie && byId('ie'))             byId('ie').value       = d.ie;
  if (d.cep && byId('cep'))           byId('cep').value      = d.cep;
  if (d.contato && byId('contato'))   byId('contato').value  = d.contato;
  const chk = document.getElementById('isentarFrete');
  if (chk) chk.checked = !!d.isentoFrete;
}

async function hydrateDatalist(){
  const list = document.getElementById('listaClientes');
  if (!list) return;
  list.innerHTML = '';
  (await clientesMaisUsados(80)).forEach(n=>{
    const o = document.createElement('option'); o.value = n; list.appendChild(o);
  });
}

(function wireClienteBlur(){
  document.addEventListener('DOMContentLoaded', ()=>{
    const el = document.getElementById('cliente');
    if (!el) return;
    el.addEventListener('blur', async ()=>{
      const nome = el.value.trim();
      if (!nome) return;
      const info = await buscarClienteInfo(nome);
      if (info) setMainFormFromCliente(info);
    });
  });
})();

// ---------- Modal (novo cliente) com AUTOFILL PROTEGIDO ----------
function el(id){ return document.getElementById(id); }
function closeModal(){ el('modalCliente')?.classList.add('hidden'); el('modalCliente')?.setAttribute('aria-hidden','true'); }
function openModal(){
  // não limpamos se o usuário abriu pra editar; apenas abrimos
  el('modalCliente')?.classList.remove('hidden');
  el('modalCliente')?.setAttribute('aria-hidden','false');
  setTimeout(()=> el('mc_nome')?.focus(), 50);
}

// Marca campo como “autofilled” quando escrevemos nele programaticamente.
// Se o usuário digitar, removemos a flag — e nunca mais sobrescrevemos.
function markManualOnInput(id){
  const e = el(id); if (!e) return;
  e.addEventListener('input', ()=>{ e.dataset.autofilled = ""; });
}
['mc_nome','mc_endereco','mc_cep','mc_ie'].forEach(markManualOnInput);

function setIfEmptyOrAuto(id, value){
  const e = el(id); if (!e) return;
  if (!value) return;
  const isEmpty = !String(e.value||"").trim();
  const wasAuto = e.dataset.autofilled === "1";
  if (isEmpty || wasAuto){
    e.value = value;
    e.dataset.autofilled = "1"; // fica marcado como vindo do autofill
  }
}

// Consulta IE RS direta (fallback) — usada só se o lookup do CNPJ não trouxe IE
async function consultaIE_RS_se_precisar(cnpjDigits){
  try{
    const r = await fetch('/api/rs-ie/lookup', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ cnpj: cnpjDigits })
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.ok) return j.ie ? j.ie.toString().toUpperCase() : (j.isento ? 'ISENTO' : null);
  }catch(_){}
  return null;
}

// Blur do CNPJ → busca /api/cnpj/lookup e preenche SEM sobrescrever digitação do usuário
async function autoPreencherPorCNPJ(){
  const cnpjRaw = el('mc_cnpj')?.value || '';
  const cnpj = digitsOnly(cnpjRaw);
  if (cnpj.length !== 14) return;

  try{
    const r = await fetch('/api/cnpj/lookup', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ cnpj })
    });
    if (!r.ok) return;
    const j = await r.json();
    if (!j?.ok) return;

    // nome (razão social)
    if (j.razao_social) setIfEmptyOrAuto('mc_nome', j.razao_social.toUpperCase());

    // endereço e CEP
    if (j.endereco) setIfEmptyOrAuto('mc_endereco', j.endereco.toUpperCase());
    if (j.cep)      setIfEmptyOrAuto('mc_cep', j.cep.replace(/^(\d{5})(\d{3}).*$/, "$1-$2"));

    // IE (se vier)
    if (j.ie) setIfEmptyOrAuto('mc_ie', String(j.ie).toUpperCase());

    // Se ainda não temos IE e o estado for RS, tenta fallback de IE
    if (!el('mc_ie')?.value && j.uf === 'RS'){
      const ieRS = await consultaIE_RS_se_precisar(cnpj);
      if (ieRS) setIfEmptyOrAuto('mc_ie', ieRS);
    }
  }catch(_){}
}

async function saveFromModal(){
  const nome      = (el('mc_nome')?.value || '').trim();
  const cnpjMask  = el('mc_cnpj')?.value || '';
  const ie        = (el('mc_ie')?.value || '').trim();
  const endereco  = (el('mc_endereco')?.value || '').trim();
  const cep       = el('mc_cep')?.value || '';
  const contato   = el('mc_contato')?.value || '';
  const isentoFre = !!el('mc_isentoFrete')?.checked;

  if (!nome){
    alert('Informe o nome do cliente.'); el('mc_nome')?.focus(); return;
  }
  await salvarCliente(nome, endereco, isentoFre, {
    cnpj: cnpjMask, ie, cep, contato
  });

  // adiciona no datalist se não existir
  const dl = document.getElementById('listaClientes');
  if (dl && !Array.from(dl.options).some(o => o.value === up(nome))) {
    const opt = document.createElement('option');
    opt.value = up(nome);
    dl.appendChild(opt);
  }

  closeModal();

  // feedback e opcionalmente preencher form principal SE estiverem vazios
  try{
    const { toastOk } = await import('./ui.js'); 
    toastOk && toastOk('Cliente salvo');
  }catch(_){}

  // preenche form principal respeitando digitação atual
  const mainEnd = document.getElementById('endereco');
  if (mainEnd && !mainEnd.value) mainEnd.value = up(endereco);
  const mainCnpj = document.getElementById('cnpj');
  if (mainCnpj && !mainCnpj.value) mainCnpj.value = digitsOnly(cnpjMask);
  const mainIE = document.getElementById('ie');
  if (mainIE && !mainIE.value) mainIE.value = up(ie);
  const mainCep = document.getElementById('cep');
  if (mainCep && !mainCep.value) mainCep.value = digitsOnly(cep).replace(/^(\d{5})(\d{3}).*$/, "$1-$2");
  const mainTel = document.getElementById('contato');
  if (mainTel && !mainTel.value) mainTel.value = digitsOnly(contato);
  const chk = document.getElementById('isentarFrete');
  if (chk && chk.checked !== isentoFre) chk.checked = isentoFre;
}

// Wires
document.addEventListener('DOMContentLoaded', ()=>{
  // botão “+” no header
  document.getElementById('btnAddCliente')?.addEventListener('click', (ev)=>{
    ev.preventDefault();
    openModal();
  });

  // modal actions
  el('modalClienteFechar')?.addEventListener('click', closeModal);
  el('modalClienteCancelar')?.addEventListener('click', closeModal);
  el('modalCliente')?.addEventListener('click', (ev)=>{
    if (ev.target?.dataset?.close) closeModal();
  });

  // máscaras leves
  const cnpj = el('mc_cnpj'), cep = el('mc_cep'), tel = el('mc_contato');
  cnpj && cnpj.addEventListener('input', ()=>maskCNPJ(cnpj));
  cep  && cep.addEventListener('input', ()=>maskCEP(cep));
  tel  && tel.addEventListener('input', ()=>maskTelefone(tel));

  // blur do CNPJ → autofill protegido
  cnpj && cnpj.addEventListener('blur', autoPreencherPorCNPJ);

  // salvar
  el('modalClienteSalvar')?.addEventListener('click', saveFromModal);

  // datalist inicial
  hydrateDatalist();
});

// ---------- Exposição global (compat) ----------
window.salvarCliente = salvarCliente;
window.buscarClienteInfo = buscarClienteInfo;
window.clientesMaisUsados = clientesMaisUsados;
window.registrarPrecoCliente = registrarPrecoCliente;