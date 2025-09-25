// js/modal-cliente.js
// Modal “Novo/Editar Cliente” com autofill por CNPJ (não sobrescreve o que o usuário digitar)

import {
  salvarCliente,
  buscarClienteInfo,
  clientesMaisUsados
} from './clientes.js';

import {
  up,
  digitsOnly,
  maskCNPJ,
  maskCEP,
  maskTelefone
} from './utils.js';

/* ============== Injeção do HTML do modal ============== */
function injectModal() {
  if (document.getElementById('modalCliente')) return;

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
            <small class="inline-help">Ao sair do campo, buscamos dados no cnpj.biz.</small>
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
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
}

/* ============== Utils DOM ============== */
const el = (id) => document.getElementById(id);

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

function openModal(){
  injectModal();
  clearForm();
  populateDatalist();
  el('modalCliente')?.classList.remove('hidden');
  el('modalCliente')?.setAttribute('aria-hidden','false');
  setTimeout(()=> el('mc_nome')?.focus(), 30);
}

function closeModal(){
  el('modalCliente')?.classList.add('hidden');
  el('modalCliente')?.setAttribute('aria-hidden','true');
}

/* ============== Não sobrescrever digitação do usuário ============== */
// marca campo como “autofilled” quando preenchido programaticamente;
// se o usuário digitar, limpamos a marca e não sobrescrevemos mais.
function markManualOnInput(id){
  const e = el(id); if (!e) return;
  e.addEventListener('input', ()=>{ e.dataset.autofilled = ""; });
}
['mc_nome','mc_endereco','mc_cep','mc_ie'].forEach(markManualOnInput);

function setIfEmptyOrAuto(id, value){
  const e = el(id); if (!e || !value) return;
  const isEmpty = !String(e.value||"").trim();
  const wasAuto = e.dataset.autofilled === "1";
  if (isEmpty || wasAuto){
    e.value = value;
    e.dataset.autofilled = "1";
  }
}

/* ============== Datalist com sugestões ============== */
async function populateDatalist(){
  const dl = el('mc_listaClientes');
  if (!dl) return;
  dl.innerHTML = '';
  try{
    const nomes = await clientesMaisUsados(80);
    nomes.forEach(n=>{
      const o = document.createElement('option');
      o.value = n;
      dl.appendChild(o);
    });
  }catch(_){}
}

/* ============== Preenchimento quando seleciona um cliente existente ============== */
async function handleNomeBlurOrChange(){
  const nome = up(el('mc_nome')?.value || '');
  if (!nome) return;
  try{
    const info = await buscarClienteInfo(nome);
    if (info){
      setTitleEditing(true);
      setIfEmptyOrAuto('mc_endereco', info.endereco || '');
      setIfEmptyOrAuto('mc_cep',      (info.cep || '').replace(/^(\d{5})(\d{3}).*$/, "$1-$2"));
      setIfEmptyOrAuto('mc_cnpj',     info.cnpj || '');
      setIfEmptyOrAuto('mc_ie',       info.ie || '');
      el('mc_isentoFrete').checked = !!info.isentoFrete;
    }else{
      setTitleEditing(false);
    }
  }catch(_){}
}

/* ============== Autofill por CNPJ (usa /portal/api/cnpj/lookup) ============== */
async function autoPreencherPorCNPJ(){
  const raw = el('mc_cnpj')?.value || '';
  const cnpj = digitsOnly(raw);
  if (cnpj.length !== 14) return;

  try{
    const r = await fetch('/portal/api/cnpj/lookup', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ cnpj })
    });
    if (!r.ok) return;
    const j = await r.json();
    if (!j?.ok) return;

    // Razão social / nome fantasia
    if (j.razao_social) setIfEmptyOrAuto('mc_nome', j.razao_social.toUpperCase());
    // Endereço / CEP
    if (j.endereco) setIfEmptyOrAuto('mc_endereco', j.endereco.toUpperCase());
    if (j.cep)      setIfEmptyOrAuto('mc_cep', j.cep.replace(/^(\d{5})(\d{3}).*$/, "$1-$2"));
    // IE (se existir na página do cnpj.biz; senão, não coloca nada)
    if (j.ie)       setIfEmptyOrAuto('mc_ie', String(j.ie).toUpperCase());
  }catch(_){}
}

/* ============== Salvar ============== */
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

  // injeta no datalist global da tela principal
  const mainDL = document.getElementById('listaClientes');
  if (mainDL && !Array.from(mainDL.options).some(o => o.value === up(nome))) {
    const opt = document.createElement('option');
    opt.value = up(nome);
    mainDL.appendChild(opt);
  }

  // se o input Cliente principal estiver vazio, já preenche
  const inputCliente = document.getElementById('cliente');
  if (inputCliente && !inputCliente.value) inputCliente.value = up(nome);

  // feedback
  try{
    const { toastOk } = await import('./ui.js');
    toastOk && toastOk('Cliente salvo');
  }catch(_){}

  closeModal();
}

/* ============== Wires ============== */
document.addEventListener('DOMContentLoaded', ()=>{
  injectModal();

  // abrir/fechar
  document.getElementById('btnAddCliente')?.addEventListener('click', (ev)=>{
    ev.preventDefault(); openModal();
  });
  document.body.addEventListener('click', (ev)=>{
    const t = ev.target;
    if (t?.id === 'modalClienteFechar' || t?.id === 'modalClienteCancelar' || t?.dataset?.close) closeModal();
    if (t?.id === 'modalClienteSalvar') saveFromModal();
  });

  // máscaras
  const cnpj = el('mc_cnpj'), cep = el('mc_cep'), tel = el('mc_contato');
  cnpj && cnpj.addEventListener('input', ()=>maskCNPJ(cnpj));
  cep  && cep.addEventListener('input', ()=>maskCEP(cep));
  tel  && tel.addEventListener('input', ()=>maskTelefone(tel));

  // blur do CNPJ → autofill protegido
  cnpj && cnpj.addEventListener('blur', autoPreencherPorCNPJ);

  // nome → tenta carregar dados do cliente existente
  const nome = el('mc_nome');
  nome && nome.addEventListener('blur',  handleNomeBlurOrChange);
  nome && nome.addEventListener('change',handleNomeBlurOrChange);

  // datalist inicial
  populateDatalist();
});