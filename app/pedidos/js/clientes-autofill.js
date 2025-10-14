// Arquivo: /app/pedidos/js/clientes-autofill.js
// Este arquivo escuta a seleção de um cliente e preenche os dados do formulário.
// Atualizado para também preencher clienteId hidden e manter compatibilidade.

import { buscarClienteInfo } from './clientes.js';

document.addEventListener('DOMContentLoaded', () => {
  const clienteInput = document.getElementById('cliente');
  if (!clienteInput) return; // Se não achar o campo, não faz nada.

  // Garante que exista um campo hidden clienteId no form
  function ensureClienteIdField() {
    let cid = document.getElementById('clienteId');
    if (!cid) {
      const form = document.getElementById('formPedido') || document.querySelector('form') || document.body;
      cid = document.createElement('input');
      cid.type = 'hidden';
      cid.id = 'clienteId';
      cid.name = 'clienteId';
      // não sobrescrever se já existir outro com mesmo id - mas garantimos criação apenas aqui
      form.appendChild(cid);
    }
    return cid;
  }

  // O evento 'change' é ideal para datalists, pois dispara após a seleção.
  clienteInput.addEventListener('change', async (event) => {
    const nomeSelecionado = event.target.value;

    if (!nomeSelecionado) {
      // Se limpou o campo, limpa também clienteId e demais campos
      const cidEl = document.getElementById('clienteId');
      if (cidEl) cidEl.value = '';
      // não limpa outros campos automaticamente para não perder edição do usuário
      return;
    }

    const overlay = document.getElementById('appOverlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
      // buscarClienteInfo deve retornar { id, endereco, cnpj, ie, cep, contato, ... }
      const info = await buscarClienteInfo(nomeSelecionado);

      if (info) {
        // Preenche os campos do formulário com os dados encontrados
        const setIf = (id, value) => {
          const el = document.getElementById(id);
          if (el) el.value = value ?? '';
        };

        setIf('endereco', info.endereco || '');
        setIf('cnpj', info.cnpj || '');
        setIf('ie', info.ie || '');
        setIf('cep', info.cep || '');
        setIf('contato', info.contato || '');

        // NOVO: armazena o id do cliente no form (campo hidden)
        const cidEl = ensureClienteIdField();
        // info pode vir como { id } ou {_id} dependendo do endpoint - normalizamos
        cidEl.value = info.id || info._id || info.clienteId || '';
      } else {
        // Se não achou no backend, zera clienteId para forçar nova criação
        const cidEl = document.getElementById('clienteId');
        if (cidEl) cidEl.value = '';
      }

    } catch (error) {
      // Em caso de erro, você pode notificar o usuário ou apenas logar no console.
      console.error("Falha ao buscar dados do cliente:", error);
    } finally {
      // Garante que o overlay de carregamento seja sempre escondido
      if (overlay) overlay.classList.add('hidden');
    }
  });
});
