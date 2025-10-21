import { onAuthUser, getCurrentUser } from '/js/firebase.js';
import { saveExpense } from './db.js';
import { startScan, stopScan } from './scanner.js';
import './modal.js';

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

/* ======== USUÁRIO LOGADO ======== */
onAuthUser((u)=>{
  const el = $('#usuarioLogado');
  if (u) el.textContent = (u.displayName || u.email || 'Usuário').split('@')[0];
  else el.textContent = 'Usuário: —';
});

/* ======== AUTOCOMPLETE CATEGORIA ======== */
const CAT_KEY = 'unikor_despesas:cats';
function getCats(){ try{ return JSON.parse(localStorage.getItem(CAT_KEY)||'[]'); }catch{return[];} }
function setCats(list){ localStorage.setItem(CAT_KEY, JSON.stringify(Array.from(new Set(list)).slice(0,50))); }
function refreshCats(){
  const dl = $('#listaCategorias');
  dl.innerHTML = '';
  getCats().forEach(c=>{ const o=document.createElement('option'); o.value=c; dl.appendChild(o); });
}
refreshCats();

/* ======== FUNÇÕES ======== */
function onlyDigits(s){ return (s||'').replace(/\D+/g,''); }
function maskCNPJ(v){
  const d = onlyDigits(v).slice(0,14);
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                   '$1.$2.$3/$4-$5').replace(/[-./]+$/,'');
}
function parseBR(n){ return parseFloat(String(n).replace(/\./g,'').replace(',','.'))||0; }
function fmtBR(v){ return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

/* ======== ITENS ======== */
function addItem(desc='',qtd='',vu=''){
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td><input class="it-desc" value="${desc}" placeholder="Descrição"/></td>
    <td><input class="it-qtd" value="${qtd}" inputmode="decimal"/></td>
    <td><input class="it-vu" value="${vu}" inputmode="decimal"/></td>
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

/* ======== EVENTOS ======== */
$('#btnAddItem').onclick = ()=>addItem();
$('#btnRemItem').onclick = ()=>remItem();
$('#tbodyItens').addEventListener('input', calcAll);
$('#cnpj').addEventListener('input',e=>e.target.value=maskCNPJ(e.target.value));
$('#formaPagamento').addEventListener('change',e=>{
  if(['CARTAO','BOLETO'].includes(e.target.value))
    $('#rowParcelas').classList.remove('hidden');
  else $('#rowParcelas').classList.add('hidden');
});

/* ======== SCANNER ======== */
$('#btnScanChave').onclick = ()=>startScan();
$('#btnCloseScan').onclick = ()=>stopScan();

/* ======== SALVAR ======== */
$('#btnAdicionarNota').onclick = async ()=>{
  const user = getCurrentUser();
  const categoria = $('#categoria').value.trim() || 'GERAL';
  setCats([categoria, ...getCats()]);
  const tipo = $$('input[name=tipo]').find(i=>i.checked)?.value || 'CUPOM';
  const fornecedor = $('#fornecedor').value.trim();
  const cnpj = $('#cnpj').value.trim();
  const forma = $('#formaPagamento').value;
  const parcelas = $('#rowParcelas').classList.contains('hidden')?1:Number($('#parcelas').value||1);
  const chave = $('#chave').value.trim();
  const itens = $$('#tbodyItens tr').map(tr=>({
    nome: tr.querySelector('.it-desc').value,
    qtd: parseBR(tr.querySelector('.it-qtd').value),
    vunit: parseBR(tr.querySelector('.it-vu').value),
    total: parseBR(tr.querySelector('.it-qtd').value)*parseBR(tr.querySelector('.it-vu').value)
  }));
  const totalCalc = itens.reduce((s,i)=>s+i.total,0);
  const totalNota = $('#totalNota').value ? parseBR($('#totalNota').value) : totalCalc;

  const payload = {
    categoria, tipo, fornecedor, cnpj,
    formaPagamento: forma, parcelas,
    chaveNFe: chave,
    itens, totalCalc, totalNota,
    createdBy: user?.email?.split('@')[0]||'anon',
    createdAt: new Date()
  };
  try{
    await saveExpense(payload);
    alert('Despesa salva com sucesso!');
  }catch(e){
    alert('Erro ao salvar: '+e.message);
  }
  $('#statusBox').textContent = JSON.stringify(payload,null,2);
};

/* ======== INIT ======== */
addItem();
calcAll();