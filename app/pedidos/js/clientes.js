// app/pedidos/js/clientes.js
import { db, authReady, TENANT_ID } from './firebase.js';
import {
  collection, addDoc, updateDoc, getDocs, query, where, orderBy, limit,
  serverTimestamp
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

// ===== Helpers de Auth =====
async function getUserOrNull() {
  try {
    const user = await authReady; // resolve com user ou null
    return user || null;
  } catch {
    return null;
  }
}
function assertUser(user) {
  if (!user) throw new Error("Usuário não autenticado");
}

// ===== Lookups =====
export async function getClienteDocByNome(nomeInput){
  const user = await getUserOrNull();
  if (!user) return null; // sem login, não consulta

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
  const user = await getUserOrNull();
  if (!user) return null;

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
    lastFrete: typeof d.lastFrete === "number" ? d.lastFrete : null,
    frete: d.frete || "" // caso tenha sido salvo como string "12,34"
  };
}

export async function clientesMaisUsados(n=50){
  const user = await getUserOrNull();
  if (!user) return []; // sem login, retorna vazio

  const out = [];
  try{
    const qs = await getDocs(query(colClientes(), orderBy("compras","desc"), limit(n)));
    qs.forEach(d=> out.push(d.data()?.nome || d.data()?.nomeUpper || ""));
  }catch{
    try {
      const qs2 = await getDocs(query(colClientes(), orderBy("nome"), limit(n)));
      qs2.forEach(d=> out.push(d.data()?.nome || d.data()?.nomeUpper || ""));
    } catch {
      /* ignora; retorna o que tem */
    }
  }
  return out.filter(Boolean);
}

// ===== Create/Update =====
export async function salvarCliente(nome, endereco, isentoFrete=false, extras={}){
  const user = await getUserOrNull();
  assertUser(user);

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
    // frete como string (mantém vírgula se usuário digitar "12,34")
    frete: typeof extras.frete === 'string' ? extras.frete : (extras.frete ?? ""),
    atualizadoEm: serverTimestamp()
  };

  const exist = await getClienteDocByNome(nomeUpper);
  if (exist) {
    await updateDoc(exist.ref, base);
  } else {
    await addDoc(colClientes(), { ...base, compras:0, criadoEm: serverTimestamp() });
  }
}

// ===== Histórico de preços por cliente/produto =====
export async function buscarUltimoPreco(clienteNome, produtoNome){
  const user = await getUserOrNull();
  if (!user) return null;

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
  const user = await getUserOrNull();
  assertUser(user);

  const nomeCli = up(clienteNome);
  const nomeProd = String(produtoNome||"").trim();
  const valor = parseFloat(preco);
  if (!nomeCli || !nomeProd || isNaN(valor)) return;

  await addDoc(colHistPreco(), {
    cliente: nomeCli, produto: nomeProd, preco: valor, data: serverTimestamp()
  });

  const found = await getClienteDocByNome(nomeCli);
  if (found) await updateDoc(found.ref, { atualizadoEm: serverTimestamp() });
}

// ===== Helpers de UI (preenche formulário principal) =====
function setMainFormFromCliente(d){
  if (!d) return;
  const byId = (id)=>document.getElementById(id);
  if (d.endereco && byId('endereco')) byId('endereco').value = d.endereco;
  if (d.cnpj && byId('cnpj')) byId('cnpj').value = d.cnpj;
  if (d.ie && byId('ie')) byId('ie').value = d.ie;
  if (d.cep && byId('cep')) byId('cep').value = d.cep;
  if (d.contato && byId('contato')) byId('contato').value = d.contato;

  const chk = document.getElementById('isentarFrete');
  if (chk) chk.checked = !!d.isentoFrete;

  // aplica sugestão de frete (campo manual + frete UI)
  if (d.frete) {
    const fm = document.getElementById('freteManual');
    if (fm && !fm.value) fm.value = d.frete;
    import('./frete.js').then(({ atualizarFreteUI }) => {
      setTimeout(() => atualizarFreteUI && atualizarFreteUI(), 200);
    });
  }
}

async function hydrateDatalist(){
  const list = document.getElementById('listaClientes');
  if (!list) return;

  const user = await getUserOrNull();
  if (!user) {
    // sem login: não popular (auth-guard deve redirecionar)
    list.innerHTML = '';
    return;
  }

  list.innerHTML = '';
  (await clientesMaisUsados(80)).forEach(n=>{
    const o = document.createElement('option'); o.value = n; list.appendChild(o);
  });
}

// ===== Auto-wire no campo "Cliente" (apenas logado) =====
(function wireClienteBlur(){
  document.addEventListener('DOMContentLoaded', async ()=>{
    const user = await getUserOrNull();
    if (!user) return; // sem login não inicializa

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

// exposição opcional (debug/dev)
window.salvarCliente = salvarCliente;
window.buscarClienteInfo = buscarClienteInfo;
window.clientesMaisUsados = clientesMaisUsados;
window.registrarPrecoCliente = registrarPrecoCliente;
