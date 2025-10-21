import { onAuthUser, getCurrentUser } from '/js/firebase.js';
import { saveExpense } from './db.js';
import { startScan, stopScan } from './scanner.js';
import './modal.js';

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
function toast(t){ const b=$('#statusBox'); if (b) b.textContent=t; }

/* Usuário topo */
onAuthUser((u)=>{
  const el = $('#usuarioLogado');
  if (u) el.textContent = (u.displayName || u.email || 'Usuário').split('@')[0];
  else el.textContent = 'Usuário: —';
});

/* Categoria autocomplete (localStorage) */
const CAT_KEY='unikor_despesas:cats';
function getCats(){ try{ return JSON.parse(localStorage.getItem(CAT_KEY)||'[]'); }catch{return[];} }
function setCats(list){ localStorage.setItem(CAT_KEY, JSON.stringify(Array.from(new Set(list)).slice(0,100))); }
function refreshCats(){
  const dl=$('#listaCategorias'); dl.innerHTML='';
  getCats().forEach(c=>{ const o=document.createElement('option'); o.value=c; dl.appendChild(o); });
}
refreshCats();

/* Helpers BR */
function onlyDigits(s){ return (s||'').replace(/\D+/g,''); }
function maskCNPJ(v){
  const d=onlyDigits(v).slice(0,14);
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5').replace(/[-./]+$/,'');
}
function parseBR(n){ return parseFloat(String(n).replace(/\./g,'').replace(',','.'))||0; }
function fmtBR(v){ return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

/* Eventos base */
document.addEventListener('click',(ev)=>{
  if (ev.target.id==='btnVoltar' || ev.target.closest('.logo')) { ev.preventDefault(); location.href='/'; }
});
$('#cnpj').addEventListener('input', e=> e.target.value = maskCNPJ(e.target.value));
$('#formaPagamento').addEventListener('change', e=>{
  const show = ['CARTAO','BOLETO'].includes(e.target.value);
  $('#rowParcelas').classList.toggle('hidden', !show);
});

/* Itens */
function addItem(desc='',qtd='',vu=''){
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td><input class="it-desc" value="${desc}" placeholder="Descrição"/></td>
    <td style="text-align:right"><input class="it-qtd" value="${qtd}" inputmode="decimal"/></td>
    <td style="text-align:right"><input class="it-vu" value="${vu}" inputmode="decimal"/></td>
    <td style="text-align:right"><span class="it-total">R$ 0,00</span></td>`;
  $('#tbodyItens').appendChild(tr);
  calcAll();
}
function remItem(){ const rows=$$('#tbodyItens tr'); if(rows.length) rows.pop().remove(); calcAll(); }
function calcAll(){
  let sumQtd=0,sumTot=0;
  $$('#tbodyItens tr').forEach(tr=>{
    const q=parseBR(tr.querySelector('.it-qtd').value);
    const vu=parseBR(tr.querySelector('.it-vu').value);
    const tot=q*vu;
    tr.querySelector('.it-total').textContent=fmtBR(tot);
    sumQtd+=q; sumTot+=tot;
  });
  $('#sumQtd').textContent=sumQtd.toLocaleString('pt-BR');
  $('#sumTotal').textContent=fmtBR(sumTot);
  if(!$('#totalNota').value) $('#totalNota').placeholder=fmtBR(sumTot);
}
$('#btnAddItem').onclick=()=>addItem();
$('#btnRemItem').onclick=()=>remItem();
$('#tbodyItens').addEventListener('input', calcAll);

/* Scanner */
$('#btnScanChave').onclick = ()=> startScan({
  onResult:(text)=>{ document.getElementById('chave').value = text.replace(/\D/g,'').slice(0,44); toast('Chave capturada!'); stopScan(); },
  onError:()=> toast('Não foi possível ler o código.')
});
$('#btnCloseScan').onclick = ()=> stopScan();

/* Salvar */
$('#btnAdicionarNota').onclick = async ()=>{
  const u = getCurrentUser();
  const categoria = $('#categoria').value.trim() || 'GERAL';
  setCats([categoria, ...getCats()]); refreshCats();

  const tipo = $$('input[name="tipo"]').find(i=>i.checked)?.value || 'CUPOM';
  const fornecedor = $('#fornecedor').value.trim();
  const cnpj = $('#cnpj').value.trim();
  const formaPagamento = $('#formaPagamento').value;
  const parcelas = ['CARTAO','BOLETO'].includes(formaPagamento) ? Number($('#parcelas').value||1) : 1;
  const chaveNFe = $('#chave').value.trim();

  const itens = $$('#tbodyItens tr').map(tr=>{
    const nome = tr.querySelector('.it-desc').value.trim();
    const qtd = parseBR(tr.querySelector('.it-qtd').value);
    const vunit = parseBR(tr.querySelector('.it-vu').value);
    const total = qtd*vunit;
    return { nome, qtd, vunit, total };
  }).filter(i=> i.nome || i.qtd || i.vunit);

  const totalCalc = itens.reduce((s,i)=>s+i.total,0);
  const totalNota = $('#totalNota').value ? parseBR($('#totalNota').value) : totalCalc;

  const payload = {
    categoria, tipo, fornecedor, cnpj,
    formaPagamento, parcelas, chaveNFe,
    itens, sumQtd: itens.reduce((s,i)=>s+i.qtd,0),
    totalLiquido: totalCalc, totalNota,
    createdByUid: u?.uid || 'anon',
    createdByName: (u?.email || '').split('@')[0] || 'anon'
  };

  try{
    toast('Salvando...');
    await saveExpense(payload);
    toast('Salvo! Abrindo pasta do Drive…');
    window.open('https://drive.google.com/drive/folders/15pbKqQ6Bhou6fz8O85-BC6n4ZglmL5bb','_blank','noopener');
  }catch(e){
    console.error(e);
    alert('Falha ao salvar no Firestore.');
    toast('Erro ao salvar.');
  }
  $('#statusBox').textContent = JSON.stringify(payload,null,2);
};

/* init */
addItem(); calcAll();