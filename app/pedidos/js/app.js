import { requireAuth, getTenantIdFrom } from "../../js/guard.js";
import { app } from "./firebase.js"; // garante inicialização
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const db = getFirestore(app);

/* ========= helpers ========= */
const $ = (id)=>document.getElementById(id);
const moneyBR = (n)=> (Number(n||0)).toFixed(2).replace(".", ",");
const parseMoney=(s)=>Number((s||"0").toString().replace(/\./g,'').replace(',','.'))||0;

function cleanDigits(s){ return (s||"").replace(/\D+/g,""); }

/* spinner util */
function setLoading(btn, isLoading, idleText){
  const lbl = btn.querySelector('.lbl');
  if (isLoading){
    btn.setAttribute('disabled','true');
    const sp=document.createElement('span'); sp.className='spinner'; sp.dataset.spin=1; btn.prepend(sp);
    if (lbl) lbl.textContent='Gerando…';
  }else{
    btn.removeAttribute('disabled');
    btn.querySelector('.spinner[data-spin]')?.remove();
    if (lbl) lbl.textContent=idleText;
  }
}
const nextFrame = ()=> new Promise(r=>setTimeout(r,0));

/* ========= itens ========= */
const tbody = $('itensBody');
function addItemRow(it={}){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="it-desc" placeholder="Produto ou descrição" value="${(it.descricao||'').replace(/"/g,'&quot;')}" /></td>
    <td>
      <select class="it-un"><option value="KG">KG</option><option value="CX">CX</option><option value="UN">UN</option></select>
    </td>
    <td><input class="it-qtd" type="number" min="0" step="0.001" value="${it.qtd||0}" /></td>
    <td><input class="it-preco" placeholder="0,00" value="${moneyBR(it.precoUnit||0)}" /></td>
    <td class="it-sub right">R$ 0,00</td>
    <td class="right"><button class="btn ghost btn-rem">X</button></td>
  `;
  tbody.appendChild(tr);
  tr.querySelector('.it-un').value = (it.un || 'KG').toUpperCase();
  const recalc = ()=> recalcTotais();
  tr.querySelectorAll('.it-qtd,.it-preco,.it-un').forEach(i=> i.addEventListener('input', recalc));
  tr.querySelector('.btn-rem').addEventListener('click', ()=>{ tr.remove(); recalcTotais(); });
  recalcTotais();
}
$('btnAddItem').onclick = ()=> addItemRow();
addItemRow();

/* ========= totais ========= */
function recalcTotais(){
  let subtotal=0, itens=0;
  tbody.querySelectorAll('tr').forEach(tr=>{
    const qtd  = Number(tr.querySelector('.it-qtd').value)||0;
    const pu   = parseMoney(tr.querySelector('.it-preco').value);
    const sub  = qtd * pu;
    tr.querySelector('.it-sub').textContent = `R$ ${moneyBR(sub)}`;
    if (qtd>0) itens++;
    subtotal += sub;
  });
  const frete = $('cIsentarFrete').checked ? 0 : parseMoney($('cFrete').value);
  $('lblTotItens').textContent = String(itens);
  $('lblSubtotal').textContent = moneyBR(subtotal);
  $('lblFrete').textContent    = moneyBR(frete);
  $('lblTotal').textContent    = moneyBR(subtotal + frete);
}
['cFrete','cIsentarFrete'].forEach(id=> $(id).addEventListener('input', recalcTotais));

/* ========= cálculo de frete (seu módulo – mantém) ========= */
$('btnCalcularFrete').addEventListener('click', async (ev)=>{
  ev.preventDefault();
  try{
    const { calcularFrete } = await import('./calcular-entrega.js');
    const valor = await calcularFrete({
      endereco: $('cEndereco').value, cep: $('cCep').value, tipo: $('cTipo').value
    });
    $('cFrete').value = moneyBR(valor||0);
    $('cIsentarFrete').checked = false;
    recalcTotais();
  }catch(e){
    alert('Não foi possível calcular o frete agora.');
  }
});

/* ========= montagem do objeto pedido ========= */
function buildPedido(){
  const itens=[];
  tbody.querySelectorAll('tr').forEach(tr=>{
    const desc = tr.querySelector('.it-desc').value.trim();
    const un   = tr.querySelector('.it-un').value.trim().toUpperCase() || 'KG';
    const qtd  = Number(tr.querySelector('.it-qtd').value)||0;
    const pu   = parseMoney(tr.querySelector('.it-preco').value);
    if (!desc && qtd<=0) return;
    itens.push({ descricao:desc, un, qtd, precoUnit:pu, subtotal: Number((qtd*pu).toFixed(2)) });
  });
  const subtotal = itens.reduce((a,b)=>a+(b.subtotal||0),0);
  const frete    = $('cIsentarFrete').checked ? 0 : parseMoney($('cFrete').value);

  return {
    cliente: $('cCliente').value.trim(),
    cnpj: cleanDigits($('cCnpj').value),
    ie: $('cIe').value.trim(),
    endereco: $('cEndereco').value.trim(),
    cep: cleanDigits($('cCep').value),
    contato: $('cContato').value.trim(),
    dataEntregaISO: $('cData').value || null,
    horaEntrega: $('cHora').value || '',
    entrega: { tipo: $('cTipo').value || 'ENTREGA' },
    pagamento: $('cPagamento').value.trim(),
    cupomFiscal: $('cCupom').value.trim(),
    obs: $('cObs').value.trim(),
    frete: Number(frete.toFixed(2)),
    itens,
    subtotal: Number(subtotal.toFixed(2)),
    totalPedido: Number((subtotal + frete).toFixed(2))
  };
}

/* ========= id determinístico (salvar só uma vez) ========= */
function pedidoId(p, tenant){
  // YYYYMMDD-HHMM + tenant + slug cliente
  const base = (p.dataEntregaISO||'').replaceAll('-','')
            + '-' + (p.horaEntrega||'').replace(':','');
  const slug = (p.cliente||'').toUpperCase().replace(/\s+/g,'').slice(0,10) || 'SEMCLIENTE';
  return `pd-${tenant}-${base}-${slug}`;
}

/* ========= Firestore idempotente ========= */
async function saveOnce(p, tenant){
  const id = pedidoId(p, tenant);
  const ref = doc(db, 'pedidos', id);
  const snap = await getDoc(ref);
  if (!snap.exists()){
    await setDoc(ref, { ...p, tenantId: tenant, status:'ABERTO', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } else {
    await updateDoc(ref, { ...p, updatedAt: serverTimestamp() });
  }
  return id;
}

/* ========= PDF (sem logo; nome “Cliente DD_MM_AA HH-MM.pdf”) ========= */
function nomePdf(p){
  const nome = (p.cliente||'CLIENTE').replace(/\s+/g,' ').trim();
  const [Y,M,D] = (p.dataEntregaISO||'').split('-');
  const [h,m]   = (p.horaEntrega||'').split(':');
  const dd=D||'DD', mm=M||'MM', aa=(Y?Y.slice(2):'AA'), hh=h||'HH', mi=m||'MM';
  return `${nome} ${dd}_${mm}_${aa} ${hh}-${mi}.pdf`;
}

async function gerarPDF(p){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'p', unit:'mm', format:'a4' });
  let y=14, left=12;

  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('Pedido — UNIKOR', left, y); y+=8;
  doc.setFont('helvetica','normal'); doc.setFontSize(10);

  const linha = (t)=>{ doc.text(t, left, y); y+=6; };

  linha(`Cliente: ${p.cliente||'-'}`);
  linha(`CNPJ/IE: ${p.cnpj||'-'}  /  ${p.ie||'-'}`);
  linha(`Endereço: ${p.endereco||'-'}  CEP: ${p.cep||'-'}  Contato: ${p.contato||'-'}`);
  linha(`Entrega: ${(p.dataEntregaISO||'-')} ${p.horaEntrega||''} — ${p.entrega?.tipo||'ENTREGA'}`);
  linha(`Pagamento: ${p.pagamento||'-'}  ${p.cupomFiscal ? '• Cupom: '+p.cupomFiscal : ''}`);
  if (p.obs) linha(`Obs.: ${p.obs}`);

  y += 2; doc.setFont('helvetica','bold'); doc.text('Itens', left, y); y+=4; doc.setFont('helvetica','normal');

  p.itens.forEach(it=>{
    if (y>280){ doc.addPage(); y=14; }
    doc.text(`• ${it.descricao} — ${it.qtd} ${it.un} x ${moneyBR(it.precoUnit)} = R$ ${moneyBR(it.subtotal)}`, left, y);
    y+=6;
  });

  y+=4; doc.setFont('helvetica','bold');
  doc.text(`SUBTOTAL: R$ ${moneyBR(p.subtotal)}   FRETE: R$ ${moneyBR(p.frete)}   TOTAL: R$ ${moneyBR(p.totalPedido)}`, left, y);

  return doc;
}

function baixarBlob(nome, blob){
  const a=document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
}

/* ========= ações ========= */
$('btnSalvar').onclick = async (ev)=>{
  const btn = ev.currentTarget; setLoading(btn,true,'Salvar PDF');
  try{
    const p = buildPedido();
    const tenant = await getTenantIdFrom(firebaseAuthUser);
    await saveOnce(p, tenant);
    await nextFrame();
    const pdf = await gerarPDF(p);
    const blob = pdf.output('blob');
    baixarBlob(nomePdf(p), blob);
  } finally { setLoading(btn,false,'Salvar PDF'); }
};

$('btnCompartilhar').onclick = async (ev)=>{
  const btn = ev.currentTarget; setLoading(btn,true,'Compartilhar PDF');
  try{
    const p = buildPedido();
    const tenant = await getTenantIdFrom(firebaseAuthUser);
    await saveOnce(p, tenant);
    await nextFrame();
    const pdf = await gerarPDF(p);
    const blob = pdf.output('blob');
    const file = new File([blob], nomePdf(p), { type:'application/pdf' });

    if (navigator.share && navigator.canShare?.({ files:[file] })){
      await navigator.share({ files:[file], title:'Pedido UNIKOR', text:`${p.cliente} — ${p.dataEntregaISO} ${p.horaEntrega}` });
    } else {
      baixarBlob(nomePdf(p), blob);
      alert('Compartilhamento nativo indisponível — o arquivo foi baixado.');
    }
  } finally { setLoading(btn,false,'Compartilhar PDF'); }
};

/* ========= guard: exige login do Portal ========= */
let firebaseAuthUser = null;
requireAuth({
  onReady: async ({ user }) => {
    firebaseAuthUser = user; // usado para tenant/assinatura
  }
});