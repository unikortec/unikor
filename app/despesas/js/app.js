// Entry renomeado: app.js (antes main.js)
import { QRScanner } from './scanner.js';

// evita dependência externa de utils
const $ = (s)=>document.querySelector(s);

// Estado local minimal
const STORAGE_KEY = 'despesas_itens';
const load = ()=>{ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; } catch { return []; } };
const save = (arr)=>localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
let itens = load();

function render(){
  const ul = $('#lista');
  if (!ul) return;
  ul.innerHTML = itens.length
    ? itens.map(i=>`<li class="list-item">
        <div class="li-main"><strong>${i.titulo || 'Sem título'}</strong><div class="li-sub">${i.valor ?? ''}</div></div>
        <button class="btn btn-xs" data-del="${i.id}">Excluir</button>
      </li>`).join('')
    : '<li class="list-empty">Sem lançamentos</li>';

  ul.querySelectorAll('[data-del]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute('data-del');
      itens = itens.filter(x=>String(x.id)!==String(id));
      save(itens); render();
    };
  });
}

async function startScanner(){
  const ov = $('#scanOverlay');
  const video = $('#scanVideo');
  const closeBtn = $('#scanClose');

  ov.hidden = false;

  const scanner = new QRScanner(video, (text)=>{
    // exemplo de payload simples {"titulo":"NF 123","valor":"R$ 45,90"}
    try{
      const data = JSON.parse(text);
      itens.unshift({
        id: Date.now(),
        titulo: data.titulo || text.slice(0,50),
        valor: data.valor || ''
      });
    }catch{
      itens.unshift({ id: Date.now(), titulo: text, valor: '' });
    }
    save(itens);
    render();
    scanner.stop();
    ov.hidden = true;
  });

  await scanner.start();

  closeBtn.onclick = ()=>{
    scanner.stop();
    ov.hidden = true;
  };
}

// Binds
$('#btnScan')?.addEventListener('click', startScanner);
$('#btnSync')?.addEventListener('click', ()=>alert('Sincronização com Firestore: em breve 👷'));

render();
