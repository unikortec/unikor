// Escuta o input #cliente e preenche os dados do cadastro na tela principal.
import { waitForLogin } from './firebase.js';
import { up, digitsOnly } from './utils.js';
import { buscarClienteInfo, clientesMaisUsados } from './clientes.js';

function $(sel){ return document.querySelector(sel); }
function setIfEmpty(id, val){
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.value || el.value.trim() === '') el.value = val || '';
}

async function hydrateDatalist(){
  const list = document.getElementById('listaClientes');
  if (!list) return;
  list.innerHTML = '';
  try{
    const nomes = await clientesMaisUsados(80);
    nomes.forEach(n=>{
      const opt = document.createElement('option');
      opt.value = n; list.appendChild(opt);
    });
  }catch(e){
    console.warn('[clientes-autofill] Falha ao carregar datalist:', e?.message||e);
  }
}

let lastFilledFor = ''; // evita re-buscar o mesmo nome
async function preencherCamposDoCliente(nomeRaw){
  const nome = up(nomeRaw || '').trim();
  if (!nome) return;
  if (lastFilledFor === nome) return;
  lastFilledFor = nome;

  try{
    const info = await buscarClienteInfo(nome); // { endereco, cnpj, ie, cep, contato, frete, isentoFrete }
    if (!info) return;

    setIfEmpty('endereco', info.endereco || '');
    setIfEmpty('cnpj', info.cnpj || '');
    setIfEmpty('ie', info.ie || '');
    setIfEmpty('cep', info.cep || '');
    setIfEmpty('contato', info.contato || '');

    // Frete do cadastro -> UI principal
    const isentar = document.getElementById('isentarFrete');
    const freteManualGroup = document.getElementById('freteManualGroup');
    const freteManual = document.getElementById('freteManual');

    if (isentar) {
      isentar.checked = !!info.isentoFrete;
    }
    if (freteManual && freteManualGroup) {
      if (info.isentoFrete) {
        freteManual.value = '';
        freteManualGroup.style.display = 'none';
      } else if (info.frete) {
        // aceita “12,34” ou “12.34”
        const s = String(info.frete).replace(/\./g, ',');
        freteManual.value = s;
        freteManualGroup.style.display = '';
      }
    }
  }catch(e){
    console.warn('[clientes-autofill] Erro ao buscar cliente:', e?.message||e);
  }
}

function debounce(fn, ms=250){
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
}

document.addEventListener('DOMContentLoaded', async ()=>{
  await waitForLogin();

  // 1) Hidrata o datalist principal com clientes frequentes
  hydrateDatalist();

  // 2) Instala listeners no #cliente
  const inp = document.getElementById('cliente');
  if (!inp) return;

  const handler = debounce(()=> preencherCamposDoCliente(inp.value), 250);
  inp.addEventListener('change', handler);
  inp.addEventListener('blur', handler);
  inp.addEventListener('input', (e)=>{
    // sempre manter UPPER durante a digitação, preservando espaços
    const cur = inp.selectionStart;
    const before = inp.value;
    const upVal = up(before.replace(/_/g,' ').replace(/\s{2,}/g,' '));
    if (upVal !== before){
      inp.value = upVal;
      try{ inp.setSelectionRange(cur, cur); }catch{}
    }
  });

  // 3) Se a página abrir já com um nome no campo, tenta preencher
  if (inp.value && inp.value.trim()) preencherCamposDoCliente(inp.value);
});