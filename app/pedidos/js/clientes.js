// app/pedidos/js/clientes.js
import { db, authReady, TENANT_ID } from './firebase.js';
import {
  collection, addDoc, updateDoc, getDocs, query, where, orderBy, limit,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  up as _up, normNome as _normNome, digitsOnly as _digitsOnly
} from './utils.js';

const up = (s)=>_up(s);
const digitsOnly = (s)=>_digitsOnly(s);
const normNome = (s)=>_normNome(s);

// coleções segmentadas
const colClientes  = () => collection(db, "tenants", TENANT_ID, "clientes");
const colHistPreco = () => collection(db, "tenants", TENANT_ID, "historico_precos");

// lookups
export async function getClienteDocByNome(nomeInput){
  await authReady;
  const alvo = normNome(nomeInput);

  try{
    const s1 = await getDocs(query(colClientes(), where("nomeNormalizado","==",alvo), limit(1)));
    if (!s1.empty) return { id:s1.docs[0].id, ref:s1.docs[0].ref, data:s1.docs[0].data() };
  }catch{}

  try{
    const s2 = await getDocs(query(colClientes(), where("nomeUpper","==", up(nomeInput)), limit(1)));
    if (!s2.empty) return { id:s2.docs[0].id, ref:s2.docs[0].ref, data:s2.docs[0].data() };
  }catch{}

  try{
    const start = up(nomeInput), end = start + '\uf8ff';
    const s3 = await getDocs(query(colClientes(), orderBy("nome"), where("nome",">=",start), where("nome","<=",end), limit(5)));
    if (!s3.empty) return { id:s3.docs[0].id, ref:s3.docs[0].ref, data:s3.docs[0].data() };
  }catch{}

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
  }catch{
    const qs2 = await getDocs(query(colClientes(), orderBy("nome"), limit(n)));
    qs2.forEach(d=> out.push(d.data()?.nome || d.data()?.nomeUpper || ""));
  }
  return out.filter(Boolean);
}

// create/update
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

// histórico de preços
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

// helpers UI
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
    hydrateDatalist();
  });
})();

// exposição opcional
window.salvarCliente = salvarCliente;
window.buscarClienteInfo = buscarClienteInfo;
window.clientesMaisUsados = clientesMaisUsados;
window.registrarPrecoCliente = registrarPrecoCliente;