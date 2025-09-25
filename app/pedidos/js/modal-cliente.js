// js/modal-cliente.js
import {
  salvarCliente,
  getClienteDocByNome,
  buscarClienteInfo,
  clientesMaisUsados
} from './clientes.js';

import { up } from './utils.js';

// ====== injeta HTML do modal no body ======
function injectModal() {
  if (document.getElementById('modalCliente')) return; // já injetado

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="modalCliente" class="modal hidden" aria-hidden="true">
      <div class="modal-backdrop" data-close="1"></div>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalClienteTitulo">
        <div class="modal-header">
          <h3 id="modalClienteTitulo">Novo Cliente</h3>
          <button class="modal-close" id="modalClienteFechar" aria-label="Fechar">×</button>
        </div>

        <div class="modal-body">
          <div class="field-group">
            <label for="mc_nome">Nome/Razão Social:</label>
            <input id="mc_nome" list="mc_listaClientes" type="text" autocomplete="off" />
            <datalist id="mc_listaClientes"></datalist>
            <small class="inline-help">Selecione para editar um cliente existente.</small>
          </div>

          <div class="field-group grid-2">
            <div>
              <label for="mc_cnpj">CNPJ:</label>
              <input id="mc_cnpj" type="text" inputmode="numeric" placeholder="00.000.000/0000-00" maxlength="18" />
              <small class="inline-help">Ao sair do campo, tentamos buscar a I.E. no RS.</small>
            </div>
            <div>
              <label for="mc_ie">Inscrição Estadual:</label>
              <input id="mc_ie" type="text" placeholder="ISENTO ou número" />
            </div>
          </div>

          <div class="field-group">
            <label for="mc_endereco">Endereço (com cidade):</label>
            <input id="mc_endereco" type="text" autocomplete="off" />
          </div>

          <div class="field-group grid-2">
            <div>
              <label for="mc_cep">CEP:</label>
              <input id="mc_cep" type="text" inputmode="numeric" placeholder="00000-000" maxlength="9" />
            </div>
            <div>
              <label for="mc_contato">Contato (tel/WhatsApp):</label>
              <input id="mc_contato" type="text" inputmode="numeric" placeholder="(00) 00000-0000" maxlength="16" />
            </div>
          </div>

          <div class="field-group">
            <label><input type="checkbox" id="mc_isentoFrete" /> Isento de frete</label>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" id="modalClienteCancelar">Cancelar</button>
          <button class="btn-primary" id="modalClienteSalvar">Salvar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap.firstElementChild);
}

// util
function el(id){ return document.getElementById(id); }

function setTitleEditing(isEditing){
  el('modalClienteTitulo').textContent = isEditing ? 'Editar Cliente' : 'Novo Cliente';
}

function clearForm(){
  el('mc_nome').value = '';
  el('mc_cnpj').value = '';
  el('mc_ie').value = '';
  el('mc_endereco').value = '';
  el('mc_cep').value = '';
  el('mc_contato').value = '';
  el('mc_isentoFrete').checked = false;
  setTitleEditing(false);
}

function closeModal(){
  el('modalCliente')?.classList.add('hidden');
  el('modalCliente')?.setAttribute('aria-hidden','true');
}
function openModal(){
  injectModal();
  clearForm();
  populateDatalist();      // pré-carrega autocomplete
  el('modalCliente')?.classList.remove('hidden');
  el('modalCliente')?.setAttribute('aria-hidden','false');
  setTimeout(()=> el('mc_nome')?.focus(), 30);
}

// carrega datalist do modal com “clientes mais usados”
async function populateDatalist(){
  const dl = el('mc_listaClientes');
  if (!dl) return;
  dl.innerHTML = '';
  try{
    const nomes = await clientesMaisUsados(80);
    nomes.forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      dl.appendChild(o);
    });
  }catch(_){}
}

// ao escolher/confirmar um nome, preenche para edição (se existir)
async function handleNomeBlurOrChange(){
  const nome = up(el('mc_nome')?.value || '');
  if (!nome) return;
  try{
    const info = await buscarClienteInfo(nome);
    if (info){
      setTitleEditing(true);
      el('mc_endereco').value = info.endereco || '';
      el('mc_cnpj').value = info.cnpj || '';
      el('mc_ie').value = info.ie || '';
      el('mc_cep').value = info.cep || '';
      el('mc_contato').value = info.contato || '';
      el('mc_isentoFrete').checked = !!info.isentoFrete;
    } else {
      setTitleEditing(false);
    }
  }catch(_){}
}

// Lookup I.E. RS ao sair do CNPJ (se campo IE estiver vazio)
async function tryLookupIE(){
  const raw = el('mc_cnpj')?.value || '';
  const cnpj = raw.replace(/\D/g,'');
  if (cnpj.length !== 14) return;
  if ((el('mc_ie')?.value || '').trim()) return;

  try{
    const r = await fetch('/api/rs-ie/lookup', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ cnpj })
    });
    if (!r.ok) return;
    const j = await r.json();
    if (j?.ok){
      if (j.ie) el('mc_ie').value = j.ie.toString().toUpperCase();
      if (j.isento) el('mc_ie').value = 'ISENTO';
    }
  }catch(_){}
}

async function saveFromModal(){
  const nome      = (el('mc_nome')?.value || '').trim();
  const cnpjMask  = el('mc_cnpj')?.value || '';
  const ie        = (el('mc_ie')?.value || '').trim();
  const endereco  = (el('mc_endereco')?.value || '').trim();
  const cep       = el('mc_cep')?.value || '';
  const contato   = el('mc_contato')?.value || '';
  const isentoFre = !!el('mc_isentoFrete')?.checked;

  if (!nome){ alert('Informe o nome do cliente.'); el('mc_nome')?.focus(); return; }

  await salvarCliente(nome, endereco, isentoFre, {
    cnpj: cnpjMask, ie, cep, contato
  });

  // adiciona no datalist global da tela principal (autocomplete do pedido)
  const mainDL = document.getElementById('listaClientes');
  if (mainDL && !Array.from(mainDL.options).some(o => o.value === up(nome))) {
    const opt = document.createElement('option');
    opt.value = up(nome);
    mainDL.appendChild(opt);
  }

  // se o input Cliente da tela principal estiver vazio, já preenche com o nome criado/atualizado
  const inputCliente = document.getElementById('cliente');
  if (inputCliente && !inputCliente.value) inputCliente.value = up(nome);

  // feedback simples
  try{
    const { toastOk } = await import('./ui.js');
    toastOk && toastOk('Cliente salvo');
  }catch(_){}

  closeModal();
}

// wires
document.addEventListener('DOMContentLoaded', ()=>{
  injectModal();

  document.getElementById('btnAddCliente')?.addEventListener('click', openModal);

  // elementos do modal (podem ainda não existir antes do inject)
  const root = document.body;
  root.addEventListener('click', (ev)=>{
    const t = ev.target;
    if (t && t.id === 'modalClienteFechar') closeModal();
    if (t && t.id === 'modalClienteCancelar') closeModal();
    if (t && t.dataset && t.dataset.close) closeModal();
    if (t && t.id === 'modalClienteSalvar') saveFromModal();
  });

  root.addEventListener('blur', (ev)=>{
    if (ev.target && ev.target.id === 'mc_cnpj') tryLookupIE();
    if (ev.target && ev.target.id === 'mc_nome') handleNomeBlurOrChange();
  }, true);

  root.addEventListener('change', (ev)=>{
    if (ev.target && ev.target.id === 'mc_nome') handleNomeBlurOrChange();
  });
});