import {
  db, auth, authReady,
  collection, addDoc, getDocs, query, where, orderBy, limit,
  updateDoc, increment, doc, setDoc, serverTimestamp
} from './firebase.js';
import { up, removeAcentos, normNome, digitsOnly } from './utils.js';

// ==== Clientes ====
export async function getClienteDocByNome(nomeInput) {
  await authReady;
  const alvo = normNome(nomeInput);

  // consulta direta por nomeNormalizado (se existir)
  try{
    const qn = query(collection(db, "clientes"), where("nomeNormalizado","==", alvo), limit(1));
    const sn = await getDocs(qn);
    if (!sn.empty) return { id: sn.docs[0].id, ref: sn.docs[0].ref, data: sn.docs[0].data() };
  }catch(_) {}

  // fallback por nomeUpper exato
  try{
    const q2 = query(collection(db, "clientes"), where("nomeUpper","==", up(nomeInput)), limit(1));
    const s2 = await getDocs(q2);
    if (!s2.empty) return { id: s2.docs[0].id, ref: s2.docs[0].ref, data: s2.docs[0].data() };
  }catch(_){}

  // fallback por prefixo de nome
  try{
    const start = up(nomeInput), end = start + '\uf8ff';
    const q3 = query(collection(db, "clientes"), orderBy("nome"), where("nome", ">=", start), where("nome", "<=", end), limit(5));
    const s3 = await getDocs(q3);
    if (!s3.empty){
      const hit = s3.docs.find(d=> removeAcentos(up(d.data()?.nome||"")) === alvo ) || s3.docs[0];
      return { id: hit.id, ref: hit.ref, data: hit.data() };
    }
  }catch(_){}

  return null;
}

export async function salvarCliente(nome, endereco, isentoFrete=false, extras={}) {
  if (!navigator.onLine) return;
  await authReady;
  const nomeNorm = up(nome);
  const enderecoNorm = up(endereco);
  if (!nomeNorm) return;

  const cnpj   = digitsOnly(extras.cnpj);
  const ie     = up(extras.ie);
  const cep    = digitsOnly(extras.cep);
  const contato= digitsOnly(extras.contato);

  const exist = await getClienteDocByNome(nomeNorm);
  if (exist) {
    const atual = exist.data || {};
    const campos = {
      atualizadoEm: serverTimestamp(),
      nomeUpper: nomeNorm,
      nomeNormalizado: normNome(nomeNorm)
    };
    if ((atual.endereco || "") !== enderecoNorm) campos.endereco = enderecoNorm;
    if (typeof isentoFrete === "boolean" && (atual.isentoFrete !== isentoFrete)) campos.isentoFrete = isentoFrete;
    if (cnpj)   campos.cnpj = cnpj;
    if (ie)     campos.ie = ie;
    if (cep)    campos.cep = cep;
    if (contato)campos.contato = contato;

    await updateDoc(exist.ref, campos);
  } else {
    await addDoc(collection(db, "clientes"), {
      nome: nomeNorm,
      nomeUpper: nomeNorm,
      nomeNormalizado: normNome(nomeNorm),
      endereco: enderecoNorm,
      isentoFrete: !!isentoFrete,
      cnpj: cnpj || "",
      ie: ie || "",
      cep: cep || "",
      contato: contato || "",
      compras: 0,
      createdBy: auth.currentUser?.uid || null,
      criadoEm: serverTimestamp()
    });
  }
}

export async function buscarClienteInfo(nomeUpper) {
  if (!nomeUpper) return null;
  const found = await getClienteDocByNome(nomeUpper);
  if (!found) return null;
  const d = found.data || {};
  return {
    endereco: (d.endereco || d.end || ""),
    isentoFrete: !!(d.isentoFrete || d.isento_frete),
    cnpj: d.cnpj || "",
    ie: d.ie || d.inscricao_estadual || "",
    cep: d.cep || "",
    contato: d.contato || d.telefone || "",
    lastFrete: typeof d.lastFrete === "number" ? d.lastFrete : (d.lastFrete ? Number(d.lastFrete) : null)
  };
}

export async function clientesMaisUsados(limitQtd = 50) {
  await authReady;
  const lista = [];
  try{
    const qs = await getDocs(query(collection(db, "clientes"), orderBy("compras","desc"), limit(limitQtd)));
    qs.forEach(d => {
      const x = d.data() || {};
      const theNome = (x.nome || x.nomeUpper || "").toString().trim();
      if (theNome) lista.push({ nome: theNome, compras: x.compras || 0 });
    });
  }catch(_){
    const qs2 = await getDocs(query(collection(db, "clientes"), orderBy("nome"), limit(limitQtd)));
    qs2.forEach(d => {
      const x = d.data() || {};
      const nome = (x.nome || x.nomeUpper || "").toString().trim();
      if (nome) lista.push({ nome, compras: x.compras || 0 });
    });
  }
  lista.sort((a,b)=> b.compras - a.compras || a.nome.localeCompare(b.nome));
  return lista.map(x => x.nome);
}

// ==== Histórico de preços / produtos por cliente ====
export async function buscarUltimoPreco(clienteNome, produtoNome) {
  await authReady;
  const nomeCli  = up(clienteNome);
  const nomeProd = String(produtoNome || "").trim();
  if (!nomeCli || !nomeProd) return null;

  const q = query(
    collection(db, "historico_precos"),
    where("cliente", "==", nomeCli),
    where("produto", "==", nomeProd),
    orderBy("data", "desc"),
    limit(1)
  );
  const qs = await getDocs(q);
  if (qs.empty) return null;
  const dados = qs.docs[0].data();
  return typeof dados.preco === "number" ? dados.preco : parseFloat(dados.preco);
}

export async function produtosDoCliente(nomeCliente) {
  await authReady;
  const nome = up(nomeCliente);
  if (!nome) return [];
  const set = new Set();
  const q = query(
    collection(db, "historico_precos"),
    where("cliente", "==", nome),
    orderBy("data", "desc"),
    limit(1000)
  );
  const qs = await getDocs(q);
  qs.forEach(d => { const p = (d.data().produto || "").trim(); if (p) set.add(p); });
  return [...set].sort((a,b)=>a.localeCompare(b));
}

export async function registrarPrecoCliente(clienteNome, produtoNome, preco) {
  if (!navigator.onLine) return;
  await authReady;
  const nomeCli  = up(clienteNome);
  const nomeProd = String(produtoNome || "").trim();
  const valor    = parseFloat(preco);
  if (!nomeCli || !nomeProd || isNaN(valor)) return;

  await addDoc(collection(db, "historico_precos"), {
    cliente: nomeCli, produto: nomeProd, preco: valor, data: serverTimestamp()
  });

  const found = await getClienteDocByNome(nomeCli);
  if (found) await updateDoc(found.ref, { compras: increment(1), atualizadoEm: serverTimestamp() });
}

// ==== Pedidos (idempotente) ====
function normalizeEnderecoForKey(str){ return up(str).replace(/\s+/g,' ').trim(); }
function itemsSig(items){
  if (!Array.isArray(items)) return '';
  return items.map(i=>[
    (i.produto||'').trim().replace(/\|/g,'/'),
    (i.tipo||''),
    Number(i.quantidade||0).toFixed(3),
    Number(i.precoUnit||i.preco||0).toFixed(2),
    Number(i.total||0).toFixed(2)
  ].join(':')).join(';');
}

export async function savePedidoIdempotente(payload){
  if (!navigator.onLine) return null;
  await authReady;

  const key = [
    payload.dataEntregaISO||"",
    payload.horaEntrega||"",
    up(payload.cliente||""),
    (payload.entrega?.tipo||""),
    normalizeEnderecoForKey(payload.entrega?.endereco||""),
    String(payload.subtotal?.toFixed ? payload.subtotal.toFixed(2) : Number(payload.subtotal||0).toFixed(2)),
    String(Array.isArray(payload.itens) ? payload.itens.length : 0),
    itemsSig(payload.itens),
    (payload.clienteFiscal?.cnpj||""),
    (payload.clienteFiscal?.ie||""),
    (payload.clienteFiscal?.cep||""),
    (payload.clienteFiscal?.contato||"")
  ].join("|");

  const qKey = query(collection(db,"pedidos"), where("idempotencyKey","==", key), limit(1));
  const snap = await getDocs(qKey);
  if (!snap.empty){
    return { id: snap.docs[0].id, key };
  }

  const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await setDoc(doc(collection(db, "pedidos"), id), {
    ...payload,
    idempotencyKey: key,
    dataEntregaDia: payload.dataEntregaISO ? Number(payload.dataEntregaISO.replaceAll('-','')) : null,
    createdBy: auth.currentUser?.uid || null,
    createdAt: serverTimestamp()
  });
  return { id, key };
}

export async function updateLastFreteCliente(nomeCliente, lastFreteNumber){
  if (!navigator.onLine) return;
  await authReady;
  const nome = up(nomeCliente);
  if (!nome) return;
  const found = await getClienteDocByNome(nome);
  if (found){
    await updateDoc(found.ref, {
      lastFrete: Number(lastFreteNumber)||0,
      atualizadoEm: serverTimestamp()
    });
  }
}

// Exposição opcional para compatibilidade (se algo externo ainda usar window.*)
window.buscarClienteInfo = async (nome)=> buscarClienteInfo(up(nome));
window.clientesMaisUsados = clientesMaisUsados;
window.buscarUltimoPreco = buscarUltimoPreco;
window.produtosDoCliente = produtosDoCliente;
window.registrarPrecoCliente = registrarPrecoCliente;
window.savePedidoIdempotente = savePedidoIdempotente;
window.updateLastFreteCliente = updateLastFreteCliente;
window.salvarCliente = salvarCliente;