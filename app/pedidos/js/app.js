import { db, ensureAnonAuth } from './firebase.js';
import {
  collection, doc, getDoc, setDoc, updateDoc,
  serverTimestamp, orderBy, query, limit
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { ensureTenant } from "../../../js/guard.js"; // <- NOVO

// helpers de caminho multi-tenant
async function colPedidos(){
  const t = await ensureTenant();
  return collection(db, `tenants/${t}/pedidos`);
}
async function refPedido(id){
  const t = await ensureTenant();
  return doc(db, `tenants/${t}/pedidos/${id}`);
}
const $ = (id)=>document.getElementById(id);
const moneyBR = (n)=> (Number(n||0)).toFixed(2).replace(".", ",");
const parseMoney=(s)=>Number((s||"0").toString().replace(/\./g,'').replace(',','.'))||0;

// itens
const tbody = document.getElementById('itensBody');
function addItemRow(item={}){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="it-desc" value="${(item.descricao||'').replace(/"/g,'&quot;')}" /></td>
    <td><input class="it-qtd" type="number" min="0" step="0.001" value="${item.qtd||0}" /></td>
    <td><input class="it-un" value="${item.un||'un'}" /></td>
    <td><input class="it-preco" value="${moneyBR(item.precoUnit||0)}" /></td>
    <td class="it-sub">R$ 0,00</td>
    <td class="right"><button class="btn ghost btn-rem">X</button></td>
  `;
  tbody.appendChild(tr);
  const recalc = ()=>recalcTotal();
  tr.querySelectorAll('.it-qtd,.it-preco').forEach(i=> i.addEventListener('input', recalc));
  tr.querySelector('.btn-rem').addEventListener('click', ()=>{ tr.remove(); recalcTotal(); });
  recalcTotal();
}
function recalcTotal(){
  let total=0;
  tbody.querySelectorAll('tr').forEach(tr=>{
    const qtd = Number(tr.querySelector('.it-qtd').value)||0;
    const pu  = parseMoney(tr.querySelector('.it-preco').value);
    const sub = qtd*pu;
    tr.querySelector('.it-sub').textContent = `R$ ${moneyBR(sub)}`;
    total += sub;
  });
  $('cTotal').value = moneyBR(total);
}
$('btnAddItem').onclick = ()=> addItemRow();
addItemRow();

// spinner util
function setLoading(btn, isLoading, idle){
  const lbl = btn.querySelector('.lbl');
  if (isLoading){
    btn.setAttribute('disabled','true');
    lbl && (lbl.textContent = 'Gerando…');
    const sp = document.createElement('span'); sp.className='spinner'; sp.dataset.spin=1;
    btn.prepend(sp);
  } else {
    btn.removeAttribute('disabled');
    const sp = btn.querySelector('.spinner[data-spin]'); sp && sp.remove();
    lbl && (lbl.textContent = idle);
  }
}
const nextFrame=()=>new Promise(r=>setTimeout(r,0));

// monta objeto pedido
function buildPedido(){
  const itens=[];
  tbody.querySelectorAll('tr').forEach(tr=>{
    const desc = tr.querySelector('.it-desc').value.trim();
    const qtd  = Number(tr.querySelector('.it-qtd').value)||0;
    const un   = tr.querySelector('.it-un').value.trim()||'un';
    const pu   = parseMoney(tr.querySelector('.it-preco').value);
    if (!desc && qtd<=0) return;
    itens.push({ descricao:desc, qtd, un, precoUnit:pu, subtotal:Number((qtd*pu).toFixed(2)) });
  });

  const totalPedido = itens.reduce((a,b)=>a+(b.subtotal||0),0);

  return {
    cliente: $('cCliente').value.trim(),
    pagamento: $('cPagamento').value.trim(),
    dataEntregaISO: $('cData').value || null,
    horaEntrega: $('cHora').value || '',
    entrega: { tipo: $('cTipo').value || 'ENTREGA' },
    cupomFiscal: $('cCupom').value.trim(),
    obs: $('cObs').value.trim(),
    itens,
    totalPedido: Number(totalPedido.toFixed(2))
  };
}

// id determinístico do pedido (ex.: por data/hora + cliente)
function pedidoId(p){
  // exemplo simples: YYYYMMDD-HHMM + hash leve do cliente
  const base = (p.dataEntregaISO||'').replaceAll('-','') + '-' + (p.horaEntrega||'').replace(':','');
  const slug = (p.cliente||'').toUpperCase().replace(/\s+/g,'').slice(0,8) || 'SEMCLIENTE';
  return `pd-${base}-${slug}`;
}

// salva uma única vez
async function saveOnce(p){
  await ensureAnonAuth();
  const id = pedidoId(p);
  const ref = doc(db, 'pedidos', id);
  const snap = await getDoc(ref);
  if (!snap.exists()){
    await setDoc(ref, {
      ...p,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'ABERTO'
    });
  } else {
    // só atualiza campos permitidos (compatível com Rules)
    await updateDoc(ref, {
      ...p,
      updatedAt: serverTimestamp()
    });
  }
  return id;
}

// nome do arquivo PDF: Nome DD_MM_AA HH-MM.pdf
function nomePdf(p){
  const nome = (p.cliente||'CLIENTE').replace(/\s+/g,' ').trim();         // sem _
  const [Y,M,D] = (p.dataEntregaISO||'').split('-');
  const [h,m]   = (p.horaEntrega||'').split(':');
  const dd = D||'DD', mm=M||'MM', aa=(Y?Y.slice(2):'AA');
  const hh = h||'HH', mi=m||'MM';
  return `${nome} ${dd}_${mm}_${aa} ${hh}-${mi}.pdf`;
}

// gera PDF (simples; sem logo)
async function gerarPDF(p){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'p', unit:'mm', format:'a4' });
  let y=16, left=12;

  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('Pedido — UNIKOR', left, y); y+=8;
  doc.setFontSize(10); doc.setFont('helvetica','normal');

  doc.text(`Cliente: ${p.cliente||'-'}`, left, y); y+=6;
  doc.text(`Entrega: ${(p.dataEntregaISO||'-')} ${p.horaEntrega||''} — ${p.entrega?.tipo||'ENTREGA'}`, left, y); y+=6;
  doc.text(`Pagamento: ${p.pagamento||'-'}`, left, y); y+=6;
  if (p.cupomFiscal) { doc.text(`Cupom: ${p.cupomFiscal}`, left, y); y+=6; }
  if (p.obs)         { doc.text(`Obs.: ${p.obs}`, left, y); y+=6; }

  y+=2;
  doc.setFont('helvetica','bold'); doc.text('Itens', left, y); y+=4;
  doc.setFont('helvetica','normal');
  p.itens.forEach(it=>{
    if (y>280){ doc.addPage(); y=16; }
    doc.text(`• ${it.descricao} — ${it.qtd} ${it.un} x ${moneyBR(it.precoUnit)} = R$ ${moneyBR(it.subtotal)}`, left, y);
    y+=6;
  });

  y+=4;
  doc.setFont('helvetica','bold');
  doc.text(`TOTAL: R$ ${moneyBR(p.totalPedido)}`, left, y);

  return doc;
}

function baixarBlob(nome, blob){
  const a=document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
}

// ações
$('btnSalvar').onclick = async (ev)=>{
  const btn = ev.currentTarget; setLoading(btn,true,'Salvar PDF');
  try{
    const p = buildPedido();
    await saveOnce(p); // idempotente
    await nextFrame();
    const doc = await gerarPDF(p);
    const nome = nomePdf(p);
    const blob = doc.output('blob');
    baixarBlob(nome, blob);
  } finally {
    setLoading(btn,false,'Salvar PDF');
  }
};

$('btnCompartilhar').onclick = async (ev)=>{
  const btn = ev.currentTarget; setLoading(btn,true,'Compartilhar PDF');
  try{
    const p = buildPedido();
    await saveOnce(p);
    await nextFrame();
    const doc = await gerarPDF(p);
    const nome = nomePdf(p);
    const blob = doc.output('blob');
    const file = new File([blob], nome, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare?.({ files:[file] })){
      await navigator.share({ files:[file], title:'Pedido UNIKOR', text:`${p.cliente} — ${p.dataEntregaISO} ${p.horaEntrega}` });
    } else {
      baixarBlob(nome, blob); // fallback
      alert('Compartilhamento nativo indisponível — o arquivo foi baixado.');
    }
  } finally {
    setLoading(btn,false,'Compartilhar PDF');
  }
};
