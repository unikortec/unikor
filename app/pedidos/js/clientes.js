// js/clientes.js
import { db, authReady, TENANT_ID } from './firebase.js';
import {
  collection, doc, setDoc, addDoc, updateDoc, getDocs, query, where, orderBy, limit,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const up = (s)=>String(s||"").trim().toUpperCase();
const digits = (s)=>String(s||"").replace(/\D/g,"");
const removeAcentos = (s)=>String(s||"").normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const normNome = (s)=> removeAcentos(up(s));

// helpers p/ coleções no tenant
const colClientes        = () => collection(db, "tenants", TENANT_ID, "clientes");
const colHistPreco       = () => collection(db, "tenants", TENANT_ID, "historico_precos");

// ---- Busca única, usando campo normalizado (novo) + fallbacks (legado)
export async function getClienteDocByNome(nomeInput){
  await authReady;
  const alvo = normNome(nomeInput);
  try{
    const q1 = query(colClientes(), where("nomeNormalizado","==",alvo), limit(1));
    const s1 = await getDocs(q1);
    if (!s1.empty) return { id:s1.docs[0].id, ref:s1.docs[0].ref, data:s1.docs[0].data() };
  }catch(_){}

  try{
    const u = up(nomeInput);
    const q2 = query(colClientes(), where("nomeUpper","==",u), limit(1));
    const s2 = await getDocs(q2);
    if (!s2.empty) return { id:s2.docs[0].id, ref:s2.docs[0].ref, data:s2.docs[0].data() };
  }catch(_){}

  try{
    const u = up(nomeInput), end = u+'\uf8ff';
    const q3 = query(colClientes(), orderBy("nome"), where("nome",">=",u), where("nome","<=",end), limit(5));
    const s3 = await getDocs(q3);
    if (!s3.empty) return { id:s3.docs[0].id, ref:s3.docs[0].ref, data:s3.docs[0].data() };
  }catch(_){}

  return null;
}

export async function salvarCliente(nome, endereco, isentoFrete=false, extras={}){
  if (!navigator.onLine) return;
  await authReady;
  const nomeUpper = up(nome);
  const enderecoUpper = up(endereco);
  const base = {
    nome: nomeUpper,
    nomeUpper,
    nomeNormalizado: normNome(nome),
    endereco: enderecoUpper,
    isentoFrete: !!isentoFrete,
    cnpj: digits(extras.cnpj)||"",
    ie: up(extras.ie)||"",
    cep: digits(extras.cep)||"",
    contato: digits(extras.contato)||"",
    atualizadoEm: serverTimestamp()
  };

  const exist = await getClienteDocByNome(nomeUpper);
  if (exist) {
    await updateDoc(exist.ref, base);
  } else {
    await addDoc(colClientes(), { ...base, compras:0, criadoEm: serverTimestamp() });
  }
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

export async function produtosDoCliente(nomeCliente){
  await authReady;
  const set = new Set();
  const nomeCli = up(nomeCliente);
  const qs = await getDocs(query(
    colHistPreco(),
    where("cliente","==",nomeCli),
    orderBy("data","desc"),
    limit(1000)
  ));
  qs.forEach(d => { const p=(d.data()?.produto||"").trim(); if(p) set.add(p); });
  return [...set].sort((a,b)=>a.localeCompare(b));
}

export async function registrarPrecoCliente(clienteNome, produtoNome, preco){
  if (!navigator.onLine) return;
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

export async function updateLastFreteCliente(nomeCliente, lastFreteNumber){
  if (!navigator.onLine) return;
  await authReady;
  const found = await getClienteDocByNome(up(nomeCliente));
  if (found) await updateDoc(found.ref, { lastFrete: Number(lastFreteNumber)||0, atualizadoEm: serverTimestamp() });
}