// js/modal-cliente.js
import { salvarCliente, buscarClienteInfo, clientesMaisUsados } from './clientes.js';
import { up, maskCNPJ, maskCEP, maskTelefone, digitsOnly } from './utils.js';

console.log('Modal cliente carregado');

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
              <input id="mc_cnpj" type="text" inputmode="numeric" placeholder="00.000.000/0000-00" maxlength="18" />
              <small class="inline-help">Preenchimento automático desabilitado.</small>
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
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  modalInjected = true;
  console.log('Modal injetado no DOM');
}

function clearForm() {
  const fields = ['mc_nome', 'mc_cnpj', 'mc_ie', 'mc_endereco', 'mc_cep', 'mc_contato'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  const checkbox = document.getElementById('mc_isentoFrete');
  if (checkbox) checkbox.checked = false;
  
  const titulo = document.getElementById('modalClienteTitulo');
  if (titulo) titulo.textContent = 'Novo Cliente';
}

function openModal() {
  console.log('Abrindo modal cliente');
  injectModal();
  clearForm();
  populateDatalist();
  
  const modal = document.getElementById('modalCliente');
  if (modal) {
    modal.classList.remove('hidden');
    // Foca no primeiro input depois que o modal abrir
    setTimeout(() => {
      const nomeInput = document.getElementById('mc_nome');
      if (nomeInput) nomeInput.focus();
    }, 100);
    console.log('Modal aberto');
  }
}

function closeModal() {
  const modal = document.getElementById('modalCliente');
  if (modal) {
    modal.classList.add('hidden');
    console.log('Modal fechado');
  }
}

async function populateDatalist() {
  const datalist = document.getElementById('mc_listaClientes');
  if (!datalist) return;
  
  datalist.innerHTML = '';
  try {
    const clientes = await clientesMaisUsados(80);
    clientes.forEach(nome => {
      const option = document.createElement('option');
      option.value = nome;
      datalist.appendChild(option);
    });
    console.log(`${clientes.length} clientes carregados no datalist`);
  } catch (error) {
    console.error('Erro ao carregar clientes:', error);
  }
}

async function handleNomeChange() {
  const nomeInput = document.getElementById('mc_nome');
  if (!nomeInput) return;
  
  const nome = up(nomeInput.value || '');
  if (!nome) return;
  
  try {
    const info = await buscarClienteInfo(nome);
    if (info) {
      const titulo = document.getElementById('modalClienteTitulo');
      if (titulo) titulo.textContent = 'Editar Cliente';
      
      // Preenche os campos apenas se estiverem vazios
      const endereco = document.getElementById('mc_endereco');
      if (endereco && !endereco.value) endereco.value = info.endereco || '';
      
      const cnpj = document.getElementById('mc_cnpj');
      if (cnpj && !cnpj.value) cnpj.value = info.cnpj || '';
      
      const ie = document.getElementById('mc_ie');
      if (ie && !ie.value) ie.value = info.ie || '';
      
      const cep = document.getElementById('mc_cep');
      if (cep && !cep.value) cep.value = info.cep || '';
      
      const contato = document.getElementById('mc_contato');
      if (contato && !contato.value) contato.value = info.contato || '';
      
      const checkbox = document.getElementById('mc_isentoFrete');
      if (checkbox) checkbox.checked = !!info.isentoFrete;
      
      console.log('Dados do cliente carregados:', info);
    } else {
      const titulo = document.getElementById('modalClienteTitulo');
      if (titulo) titulo.textContent = 'Novo Cliente';
    }
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
  }
}

async function autoPreencherPorCNPJ() {
  const cnpjInput = document.getElementById('mc_cnpj');
  if (!cnpjInput) return;
  
  const cnpjRaw = cnpjInput.value || '';
  const cnpj = digitsOnly(cnpjRaw);
  if (cnpj.length !== 14) return;
  
  console.log('CNPJ lookup temporariamente desabilitado');
  return; // TEMPORARIAMENTE DESABILITADO
}

async function saveFromModal() {
  const nome = (document.getElementById('mc_nome')?.value || '').trim();
  const endereco = (document.getElementById('mc_endereco')?.value || '').trim();
  const cnpjMask = document.getElementById('mc_cnpj')?.value || '';
  const ie = (document.getElementById('mc_ie')?.value || '').trim();
  const cep = document.getElementById('mc_cep')?.value || '';
  const contato = document.getElementById('mc_contato')?.value || '';
  const isentoFrete = !!document.getElementById('mc_isentoFrete')?.checked;
  
  if (!nome) {
    alert('Informe o nome do cliente.');
    document.getElementById('mc_nome')?.focus();
    return;
  }
  
  try {
    await salvarCliente(nome, endereco, isentoFrete, { cnpj: cnpjMask, ie, cep, contato });
    
    // Atualiza a lista principal
    const mainDatalist = document.getElementById('listaClientes');
    if (mainDatalist && !Array.from(mainDatalist.options).some(o => o.value === up(nome))) {
      const option = document.createElement('option');
      option.value = up(nome);
      mainDatalist.appendChild(option);
    }
    
    // Preenche o campo cliente principal se estiver vazio
    const inputCliente = document.getElementById('cliente');
    if (inputCliente && !inputCliente.value) {
      inputCliente.value = up(nome);
    }
    
    // Toast de sucesso
    try {
      const { toastOk } = await import('./ui.js');
      if (toastOk) toastOk('Cliente salvo com sucesso!');
    } catch (error) {
      console.log('Cliente salvo com sucesso!');
    }
    
    closeModal();
    console.log('Cliente salvo:', nome);
  } catch (error) {
    console.error('Erro ao salvar cliente:', error);
    alert('Erro ao salvar cliente: ' + error.message);
  }
}

// Inicialização quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado, inicializando modal cliente');
  
  // Injeta o modal
  injectModal();
  
  // Event listener para o botão +
  const btnAddCliente = document.getElementById('btnAddCliente');
  if (btnAddCliente) {
    btnAddCliente.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Botão + clicado');
      openModal();
    });
    console.log('Listener do botão + configurado');
  } else {
    console.error('Botão btnAddCliente não encontrado');
  }
  
  // Event listeners do modal
  document.body.addEventListener('click', (event) => {
    const target = event.target;
    
    if (target?.id === 'modalClienteFechar' || 
        target?.id === 'modalClienteCancelar' || 
        target?.dataset?.close) {
      closeModal();
    }
    
    if (target?.id === 'modalClienteSalvar') {
      saveFromModal();
    }
  });
  
  // Máscaras de input
  document.body.addEventListener('input', (event) => {
    const target = event.target;
    
    if (target?.id === 'mc_cnpj') {
      maskCNPJ(target);
    } else if (target?.id === 'mc_cep') {
      maskCEP(target);
    } else if (target?.id === 'mc_contato') {
      maskTelefone(target);
    }
  });
  
  // Blur events
  document.body.addEventListener('blur', (event) => {
    const target = event.target;
    
    if (target?.id === 'mc_nome') {
      handleNomeChange();
    } else if (target?.id === 'mc_cnpj') {
      autoPreencherPorCNPJ();
    }
  }, true);
  
  // Change events
  document.body.addEventListener('change', (event) => {
    if (event.target?.id === 'mc_nome') {
      handleNomeChange();
    }
  });
  
  // Popula a lista inicial
  populateDatalist();
  
  console.log('Modal cliente totalmente configurado');
});
