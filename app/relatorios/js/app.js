// app/relatorios/js/app.js
import { db, ensureAnonAuth } from '../../pedidos/js/firebase.js';
import {
  collection, query, where, orderBy, limit, getDocs,
  doc, getDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { ensureTenant, getClaims } from "../../../js/guard.js";

const $=(id)=>document.getElementById(id);
const moneyBR=(n)=> (Number(n||0)).toFixed(2).replace('.',',');
const parseMoney=(s)=>Number((s||"0").toString().replace(/\./g,'').replace(',','.'))||0;

let __rows=[]; let __currentId=null; let __canDelete=false;

/* ===== coleção multi-tenant ===== */
async function colPedidos(){
  const t = await ensureTenant();
  return collection(db, `tenants/${t}/pedidos`);
}
async function refPedido(id){
  const t = await ensureTenant();
  return doc(db, `tenants/${t}/pedidos/${id}`);
}

/* ===== permissão de excluir ===== */
(async () => {
  const claims = await getClaims(true);
  const role = claims.role || 'geral';
  __canDelete = (role === 'admin' || role === 'master');
})();

/* ===== spinner ===== */
function setLoading(btn, is, idle){
  const lbl = btn.querySelector('.lbl');
  if (is){
    btn.setAttribute('disabled','true');
    const sp=document.createElement('span'); sp.className='spinner'; sp.dataset.spin=1;
    btn.prepend(sp); lbl&&(lbl.textContent='Gerando…');
  } else {
    btn.removeAttribute('disabled');
    btn.querySelector('.spinner[data-spin]')?.remove();
    lbl&&(lbl.textContent=idle);
  }
}
const nextFrame=()=>new Promise(r=>setTimeout(r,0));

/* ===== render ===== */
function toBR(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function renderRows(list){
  const tbody=$('tbody'); let total=0;
  if (!list.length){
    tbody.innerHTML=`<tr><td colspan="9">Sem resultados.</td></tr>`;
    $('ftCount').textContent='0 pedidos'; $('ftTotal').textContent='R$ 0,00';
    return;
  }

  const rows = list.map(r=>{
    total += Number(r.totalPedido||0);
    const cupom = (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : '–';
    const tipo  = ((r.entrega?.tipo||'').toUpperCase()==='RETIRADA'?'RETIRADA':'ENTREGA');
    const delBtn = __canDelete ? `<button class="btn danger btn-cancel" data-id="${r.id}">×</button>` : '';
    return `<tr data-id="${r.id}">
      <td>${toBR(r.dataEntregaISO)||''}</td>
      <td>${r.horaEntrega||''}</td>
      <td class="cell-client" data-id="${r.id}" title="Clique para editar">${r.cliente||''}</td>
      <td>${Array.isArray(r.itens)?r.itens.length:0}</td>
      <td>R$ ${moneyBR(r.totalPedido||0)}</td>
      <td>${tipo}</td>
      <td>${r.pagamento||''}</td>
      <td>${cupom}</td>
      <td>${delBtn}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
  $('ftCount').textContent = `${list.length} pedido(s)`;
  $('ftTotal').textContent = `R$ ${moneyBR(total)}`;
}

/* ===== busca ===== */
async function buscar(){
  await ensureAnonAuth();
  const di=$('fDataIni').value, df=$('fDataFim').value;
  const cliente=($('fCliente').value||'').trim().toUpperCase();
  const tipoSel=($('fTipo').value||'').trim();

  const ref = await colPedidos();
  let qRef;
  if (di||df){
    const wh=[]; if (di) wh.push(where('dataEntregaISO','>=',di)); if (df) wh.push(where('dataEntregaISO','<=',df));
    qRef = query(ref, ...wh, orderBy('dataEntregaISO','desc'), limit(1000));
  } else {
    qRef = query(ref, orderBy('createdAt','desc'), limit(1000));
  }
  const snap=await getDocs(qRef);
  const list=[]; snap.forEach(d=> list.push({ id:d.id, ...d.data() }));
  const out=list.filter(x=>{
    if (cliente && !(x.cliente||'').toUpperCase().includes(cliente)) return false;
    if (tipoSel && ((x.entrega?.tipo||'').toUpperCase()!==tipoSel)) return false;
    return true;
  });
  __rows=out; renderRows(out);
}

/* ===== modal editar ===== */
function openModal(){ const m=$('modalBackdrop'); m.style.display='flex'; m.setAttribute('aria-hidden','false'); }
function closeModal(){ const m=$('modalBackdrop'); m.style.display='none'; m.setAttribute('aria-hidden','true'); __currentId=null; $('itemsBody').innerHTML=''; }
function recalcTotal(){
  let tot=0;
  $('itemsBody').querySelectorAll('tr').forEach(tr=>{
    const qtd = Number(tr.querySelector('.it-qtd').value)||0;
    const pu  = parseMoney(tr.querySelector('.it-preco').value);
    const sub = qtd*pu;
    tr.querySelector('.it-sub').textContent = `R$ ${moneyBR(sub)}`;
    tot += sub;
  });
  $('mTotal').value = moneyBR(tot);
}
function addItemRow(it={}){
  const tr=document.createElement('tr');
  tr.innerHTML = `
    <td><input class="it-desc" value="${(it.descricao||'').replace(/"/g,'&quot;')}" /></td>
    <td><input class="it-qtd" type="number" min="0" step="0.001" value="${it.qtd||0}" /></td>
    <td><input class="it-un" value="${it.un||'un'}" /></td>
    <td><input class="it-preco" value="${moneyBR(it.precoUnit||0)}" /></td>
    <td class="it-sub">R$ 0,00</td>
    <td class="right"><button class="btn ghost btn-rem">X</button></td>
  `;
  $('itemsBody').appendChild(tr);
  tr.querySelectorAll('.it-qtd,.it-preco').forEach(i=> i.addEventListener('input', recalcTotal));
  tr.querySelector('.btn-rem').addEventListener('click', ()=>{ tr.remove(); recalcTotal(); });
  recalcTotal();
}
async function carregarPedidoEmModal(id){
  await ensureAnonAuth();
  __currentId=id;
  const s=await getDoc(await refPedido(id));
  if (!s.exists()) return alert('Pedido não encontrado.');
  const r={ id:s.id, ...s.data() };

  $('mId').value=r.id; $('mCliente').value=r.cliente||'';
  $('mDataEntregaISO').value=r.dataEntregaISO||''; $('mHoraEntrega').value=r.horaEntrega||'';
  $('mTipo').value=((r.entrega?.tipo||'').toUpperCase()==='RETIRADA'?'RETIRADA':'ENTREGA');
  $('mPagamento').value=r.pagamento||''; $('mCupomFiscal').value=r.cupomFiscal||''; $('mObs').value=r.obs||'';

  $('itemsBody').innerHTML='';
  (Array.isArray(r.itens)?r.itens:[]).forEach(addItemRow);
  if (!r.itens?.length) addItemRow({});
  recalcTotal(); openModal();
}
async function salvarEdicao(){
  await ensureAnonAuth();
  if (!__currentId){ closeModal(); return; }
  const itens=[];
  $('itemsBody').querySelectorAll('tr').forEach(tr=>{
    const desc=tr.querySelector('.it-desc').value.trim();
    const qtd =Number(tr.querySelector('.it-qtd').value)||0;
    const un  =tr.querySelector('.it-un').value.trim()||'un';
    const pu  =parseMoney(tr.querySelector('.it-preco').value);
    if (!desc && qtd<=0) return;
    itens.push({ descricao:desc, qtd, un, precoUnit:pu, subtotal:Number((qtd*pu).toFixed(2)) });
  });
  const total = itens.reduce((a,b)=>a+(b.subtotal||0),0);

  const payload={
    cliente:$('mCliente').value.trim(),
    dataEntregaISO:$('mDataEntregaISO').value||null,
    horaEntrega:$('mHoraEntrega').value||'',
    entrega:{ tipo:$('mTipo').value||'ENTREGA' },
    pagamento:$('mPagamento').value.trim()||'',
    cupomFiscal:$('mCupomFiscal').value.trim()||'',
    obs:$('mObs').value.trim()||'',
    itens, totalPedido:Number(total.toFixed(2)),
    updatedAt: serverTimestamp()
  };
  await updateDoc(await refPedido(__currentId), payload);
  closeModal();
  const idx=__rows.findIndex(x=>x.id===__currentId);
  if (idx>=0) __rows[idx]={ ...__rows[idx], ...payload };
  renderRows(__rows);
  alert('Pedido atualizado.');
}

/* ===== excluir ===== */
async function excluirPedido(id){
  await ensureAnonAuth();
  if (!__canDelete){ return alert('Sem permissão para excluir.'); }
  if (!confirm('Gostaria de excluir o pedido?')) return;
  try{
    await deleteDoc(await refPedido(id));
    __rows = __rows.filter(x=>x.id!==id);
    renderRows(__rows);
    alert('Pedido excluído.');
  }catch(e){
    alert('Não foi possível excluir. Verifique permissões nas Rules.');
  }
}

/* ===== XLSX ===== */
async function exportarXLSX(){
  if (!__rows.length) return alert('Nada para exportar.');
  const btn=$('btnXLSX'); setLoading(btn,true,'Exportar XLSX');
  try{
    const modo=$('fModo').value||'reduzido';
    const data=__rows.map(r=>{
      const base={
        'Data':toBR(r.dataEntregaISO||''),'Hora':r.horaEntrega||'','Cliente':r.cliente||'',
        'Itens':Array.isArray(r.itens)?r.itens.length:0,'Total (R$)':Number(r.totalPedido||0),
        'Tipo':((r.entrega?.tipo||'').toUpperCase()==='RETIRADA'?'RETIRADA':'ENTREGA'),
        'Pagamento':r.pagamento||'','Cupom':(r.cupomFiscal?.trim()?r.cupomFiscal:'-'),'ID':r.id
      };
      if (modo==='detalhado'){
        const items=(Array.isArray(r.itens)?r.itens:[])
          .map(i=>`${i.descricao||''} • ${i.qtd||0} ${i.un||'un'} x ${i.precoUnit||0}`).join(' | ');
        return { ...base, 'Itens (detalhe)':items };
      }
      return base;
    });
    const ws=XLSX.utils.json_to_sheet(data);
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Relatorio');
    await nextFrame();
    XLSX.writeFile(wb, `Relatorio_${new Date().toISOString().slice(0,10)}.xlsx`);
  } finally { setLoading(btn,false,'Exportar XLSX'); }
}

/* ===== PDF ===== */
async function exportarPDF(){
  if (!__rows.length) return alert('Nada para gerar.');
  const btn=$('btnPDF'); setLoading(btn,true,'Gerar PDF');
  try{
    const { jsPDF }=window.jspdf;
    const doc=new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
    const left=10, top=12, lineH=7, maxW=277; let y=top;

    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text('Relatórios — UNIKOR', left, y); y+=6;
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, left, y); y+=6;

    const headers=['Data','Hora','Cliente','Itens','Total (R$)','Tipo','Pagamento','Cupom'];
    const colsW  =[20,16,70,14,26,24,40,55];
    let x=left; doc.setFont('helvetica','bold');
    headers.forEach((h,i)=>{ doc.text(h,x,y); x+=colsW[i]; });
    y+=3; doc.setLineWidth(.2); doc.line(left,y,left+colsW.reduce((a,b)=>a+b,0),y); y+=4;
    doc.setFont('helvetica','normal');

    const modo=$('fModo').value||'reduzido';

    for (const r of __rows){
      x=left;
      const row=[
        toBR(r.dataEntregaISO||''), r.horaEntrega||'', r.cliente||'',
        (Array.isArray(r.itens)?r.itens.length:0).toString(),
        moneyBR(r.totalPedido||0),
        ((r.entrega?.tipo||'').toUpperCase()==='RETIRADA'?'RETIRADA':'ENTREGA'),
        r.pagamento||'', (r.cupomFiscal?.trim()?r.cupomFiscal:'-')
      ];
      const clienteLines=doc.splitTextToSize(row[2], colsW[2]-2);
      const cupomLines  =doc.splitTextToSize(row[7], colsW[7]-2);
      const lines=Math.max(1,clienteLines.length,cupomLines.length);
      const h=lines*lineH;
      if (y+h>200){ doc.addPage(); y=top; }

      const cells=[row[0],row[1],clienteLines,row[3],row[4],row[5],row[6],cupomLines];
      for (let i=0;i<cells.length;i++){
        const v=cells[i];
        if (Array.isArray(v)) v.forEach((ln,k)=>doc.text(ln,x,y+(k+1)*lineH-2));
        else doc.text(String(v),x,y+lineH-2);
        x+=colsW[i];
      }
      y+=h;

      if (modo==='detalhado' && Array.isArray(r.itens) && r.itens.length){
        const items=r.itens.map(it=>`• ${it.descricao||''} — ${it.qtd||0} ${it.un||'un'} x ${moneyBR(it.precoUnit||0)} = ${moneyBR(it.subtotal||0)}`).join('\n');
        const lines=doc.splitTextToSize(items, maxW);
        lines.forEach(ln=>{ if (y>200){ doc.addPage(); y=top; } doc.text(ln,left+6,y); y+=5; });
        y+=2;
      }
    }
    const total=__rows.reduce((s,r)=>s+Number(r.totalPedido||0),0);
    doc.setFont('helvetica','bold'); doc.setFontSize(11);
    if (y>190){ doc.addPage(); y=top; }
    doc.text(`TOTAL: R$ ${moneyBR(total)}`, left, y+6);

    await nextFrame();
    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  } finally { setLoading(btn,false,'Gerar PDF'); }
}

/* ===== eventos ===== */
$('btnBuscar').onclick=buscar;
$('btnLimpar').onclick=()=>{ ['fDataIni','fDataFim','fCliente'].forEach(i=>$(i).value=''); $('fTipo').value=''; $('tbody').innerHTML=''; __rows=[]; $('ftCount').textContent='0 pedidos'; $('ftTotal').textContent='R$ 0,00'; };
$('btnXLSX').onclick=exportarXLSX;
$('btnPDF').onclick=exportarPDF;

$('tbody').addEventListener('click', (ev)=>{
  const td=ev.target.closest('.cell-client'); if (td){ carregarPedidoEmModal(td.dataset.id); return; }
  const del=ev.target.closest('.btn-cancel'); if (del){ excluirPedido(del.dataset.id); }
});

$('btnFecharModal').onclick=()=>closeModal();
$('btnAddItem').onclick = ()=> addItemRow({});
$('btnSalvar').onclick  = ()=> salvarEdicao();

await ensureAnonAuth();
// buscar(); // opcional