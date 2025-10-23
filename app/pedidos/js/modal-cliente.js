// app/pedidos/js/modal-cliente.js
import { salvarCliente, buscarClienteInfo, clientesMaisUsados, listarClientesAlfabetico } from './clientes.js';
import { up, maskCNPJ, maskCEP, maskTelefone, digitsOnly } from './utils.js';
import { waitForLogin, getCurrentUser } from './firebase.js';

console.log('[ModalCliente] módulo carregado');

let modalInjected = false;

function injectModal() {
  if (modalInjected || document.getElementById('modalCliente')) return;

  const modalHTML = `
    <div id="modalCliente" class="modal hidden">
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
              <div style="display:flex; gap:8px; align-items:center;">
                <input id="mc_cnpj" type="text" inputmode="numeric" placeholder="00.000.000/0000-00" maxlength="18" style="flex:1;" />
                <button type="button" id="mc_consultarCNPJ" class="btn-consultar" title="Consultar CNPJ em cnpj.biz">🔍</button>
              </div>
              <small class="inline-help">Digite o CNPJ e clique na lupa para abrir em cnpj.biz.</small>
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
            <div class="frete-row">
              <label for="mc_frete">Frete:</label>
              <input id="mc_frete" type="text" inputmode="decimal" placeholder="0,00" style="flex:1;" />
              <div class="switch-box" style="margin-left:12px;">
                <input type="checkbox" id="mc_isentoFrete" />
                <label for="mc_isentoFrete">Isento</label>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" id="modalClienteCancelar">Cancelar</button>
          <button class="btn-primary" id="modalClienteSalvar">Salvar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  modalInjected = true;
  console.log('[ModalCliente] HTML injetado');
}

function clearForm() {
  ['mc_nome','mc_cnpj','mc_ie','mc_endereco','mc_cep','mc_contato','mc_frete'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const chk = document.getElementById('mc_isentoFrete');
  if (chk) chk.checked = false;

  const titulo = document.getElementById('modalClienteTitulo');
  if (titulo) titulo.textContent = 'Novo Cliente';
}

function openModal() {
  injectModal();
  clearForm();
  populateDatalist();

  const modal = document.getElementById('modalCliente');
  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(()=> document.getElementById('mc_nome')?.focus(), 80);
  }
}
function closeModal() { document.getElementById('modalCliente')?.classList.add('hidden'); }

function consultarCNPJ() {
  const cnpjInput = document.getElementById('mc_cnpj');
  if (!cnpjInput) return;
  const raw = cnpjInput.value || '';
  const digits = digitsOnly(raw);
  if (!raw.trim()) { alert('Digite o CNPJ antes de consultar.'); cnpjInput.focus(); return; }
  if (digits.length !== 14) { alert('CNPJ deve ter 14 dígitos.'); cnpjInput.focus(); return; }
  const url = `https://cnpj.biz/${digits}`;
  const width = 1100, height = 800;
  const left = (screen.width - width) / 2, top = (screen.height - height) / 2;
  const popup = window.open(url, 'consultaCNPJ', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
  if (!popup) alert('Não foi possível abrir o popup. Desative o bloqueador de pop-ups.');
}

async function populateDatalist() {
  await waitForLogin();
  const datalist = document.getElementById('mc_listaClientes');
  if (!datalist) return;
  datalist.innerHTML = '';
  try {
    // Preferimos uma lista alfabética abrangente (une clienteUpper e nomeUpper)
    const nomes = await listarClientesAlfabetico(500);
    if (nomes.length === 0) {
      // fallback (mais usados)
      const top = await clientesMaisUsados(80);
      top.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        datalist.appendChild(option);
      });
      return;
    }
    nomes.forEach(nome => {
      const option = document.createElement('option');
      option.value = nome;
      datalist.appendChild(option);
    });
  } catch (e) {
    console.error('[ModalCliente] Erro ao carregar clientes:', e);
  }
}

async function handleNomeChange() {
  await waitForLogin();
  const nomeInput = document.getElementById('mc_nome'); if (!nomeInput) return;
  const nome = up(nomeInput.value || ''); if (!nome) return;
  try {
    const info = await buscarClienteInfo(nome);
    const titulo = document.getElementById('modalClienteTitulo');
    if (info) {
      if (titulo) titulo.textContent = 'Editar Cliente';
      const setIfEmpty = (id, val) => { const el = document.getElementById(id); if (el && !el.value) el.value = val || ''; };
      setIfEmpty('mc_endereco', info.endereco);
      setIfEmpty('mc_cnpj', info.cnpj);
      setIfEmpty('mc_ie', info.ie);
      setIfEmpty('mc_cep', info.cep);
      setIfEmpty('mc_contato', info.contato);
      if (info.frete && !document.getElementById('mc_frete').value) document.getElementById('mc_frete').value = info.frete;
      document.getElementById('mc_isentoFrete').checked = !!info.isentoFrete;
    } else {
      if (titulo) titulo.textContent = 'Novo Cliente';
    }
  } catch (e) {
    console.error('[ModalCliente] Erro ao buscar cliente:', e);
  }
}

function handleFreteChange() {
  const frete = document.getElementById('mc_frete');
  const chk = document.getElementById('mc_isentoFrete');
  if (!frete || !chk) return;
  if (chk.checked) { frete.value = '0,00'; frete.disabled = true; }
  else { frete.disabled = false; if (frete.value === '0,00') frete.value = ''; }
}

async function saveFromModal() {
  await waitForLogin();
  if (!getCurrentUser()) { alert('Faça login para salvar clientes.'); return; }

  const nome = (document.getElementById('mc_nome')?.value || '').trim();
  const endereco = (document.getElementById('mc_endereco')?.value || '').trim();
  const cnpjMask = document.getElementById('mc_cnpj')?.value || '';
  const ie = (document.getElementById('mc_ie')?.value || '').trim();
  const cep = document.getElementById('mc_cep')?.value || '';
  const contato = document.getElementById('mc_contato')?.value || '';
  const freteStr = document.getElementById('mc_frete')?.value || '';
  const isentoFrete = !!document.getElementById('mc_isentoFrete')?.checked;

  if (!nome) { alert('Informe o nome do cliente.'); document.getElementById('mc_nome')?.focus(); return; }

  try {
    const res = await salvarCliente(nome, endereco, isentoFrete, { cnpj: cnpjMask, ie, cep, contato, frete: freteStr, endereco });
    // atualiza datalist da tela principal
    const mainDatalist = document.getElementById('listaClientes');
    if (mainDatalist && !Array.from(mainDatalist.options).some(o => o.value === up(nome))) {
      const option = document.createElement('option'); option.value = up(nome); mainDatalist.appendChild(option);
    }
    // joga nome no input principal se estiver vazio
    const inputCliente = document.getElementById('cliente');
    if (inputCliente && !inputCliente.value) inputCliente.value = up(nome);

    try { const { toastOk } = await import('./ui.js'); toastOk && toastOk('Cliente salvo com sucesso!'); }
    catch { console.log('[ModalCliente] Cliente salvo com sucesso!'); }

    closeModal();
  } catch (e) {
    console.error('[ModalCliente] Erro ao salvar cliente:', e);
    alert('Erro ao salvar cliente: ' + e.message);
  }
}

/* ===================== Inicialização ===================== */
document.addEventListener('DOMContentLoaded', async () => {
  await waitForLogin();          // garante sessão
  injectModal();                 // injeta HTML do modal

  const bindBtn = () => {
    const btnAddCliente = document.getElementById('btnAddCliente');
    if (btnAddCliente && !btnAddCliente._mcBound) {
      btnAddCliente._mcBound = true;
      btnAddCliente.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    }
  };
  bindBtn();
  setTimeout(bindBtn, 500);

  document.body.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t?.id === 'modalClienteFechar' || t?.id === 'modalClienteCancelar' || t?.dataset?.close) closeModal();
    if (t?.id === 'modalClienteSalvar') saveFromModal();
    if (t?.id === 'mc_consultarCNPJ') consultarCNPJ();
  });

  document.body.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t?.id === 'mc_cnpj') maskCNPJ(t);
    else if (t?.id === 'mc_cep') maskCEP(t);
    else if (t?.id === 'mc_contato') maskTelefone(t);
  });

  document.body.addEventListener('blur', (ev) => { if (ev.target?.id === 'mc_nome') handleNomeChange(); }, true);
  document.body.addEventListener('change', (ev) => {
    if (ev.target?.id === 'mc_nome') handleNomeChange();
    else if (ev.target?.id === 'mc_isentoFrete') handleFreteChange();
  });

  populateDatalist();
  console.log('[ModalCliente] pronto');
});