import { onAuthUser, getCurrentUser } from '/js/firebase.js';
import { saveExpense } from './db.js';
import { startScan, stopScan } from './scanner.js';
import './modal.js';

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
function showStatus(t){ const b=$('#statusBox'); if (b){ b.classList.remove('hidden'); b.textContent=t; } }

/* Usuário topo */
onAuthUser((u)=>{
  const el = $('#usuarioLogado');
  el.textContent = u ? (u.displayName || u.email || 'Usuário').split('@')[0] : 'Usuário: —';
});

/* Categoria autocomplete */
const CAT_KEY='unikor_despesas:cats';
function getCats(){ try{ return JSON.parse(localStorage.getItem(CAT_KEY)||'[]'); }catch{return[];} }
function setCats(list){ localStorage.setItem(CAT_KEY, JSON.stringify(Array.from(new Set(list)).slice(0,100))); }
function refreshCats(){ const dl=$('#listaCategorias'); dl.innerHTML=''; getCats().forEach(c=>{ const o=document.createElement('option'); o.value=c; dl.appendChild(o); }); }
refreshCats();

/* Helpers BR */
const onlyDigits = s => (s||'').replace(/\D+/g,'');
const maskCNPJ = v => (onlyDigits(v).slice(0,14).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5').replace(/[-./]+$/,''));
const parseBR = n => parseFloat(String(n).replace(/\./g,'').replace(',','.'))||0;
const fmtBR = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

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
  $('#tbodyItens').appendChild(tr); calcAll();
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
  onResult:(text)=>{ document.getElementById('chave').value = text.replace(/\D/g,'').slice(0,44); showStatus('Chave capturada!'); stopScan(); },
  onError:()=> showStatus('Não foi possível ler o código.')
});
$('#btnCloseScan').onclick = ()=> stopScan();

/* Salvar + abrir drive (aba primeiro para não bloquear) */
const DRIVE_URL = 'https://drive.google.com/drive/folders/15pbKqQ6Bhou6fz8O85-BC6n4ZglmL5bb';
$('#btnAdicionarNota').addEventListener('click', async (e)=>{
  // abre a aba imediatamente (não bloqueia popup)
  const win = window.open(DRIVE_URL,'_blank','noopener'); // pode ser null se bloqueado
  e.preventDefault();

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
    return { nome, qtd, vunit, total: qtd*vunit };
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
    showStatus('Salvando…');
    await saveExpense(payload);
    showStatus('Salvo com sucesso.');
  }catch(err){
    console.error(err);
    showStatus('Falha ao salvar no Firestore.');
    alert('Falha ao salvar no Firestore.');
  }
  // debug opcional: comente a linha abaixo para esconder o JSON
  // document.getElementById('statusBox').classList.add('hidden');
});
/* init */
addItem(); calcAll();