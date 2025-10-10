// Arquivo: /app/pedidos/js/clientes-autofill.js
// Este arquivo escuta a seleção de um cliente e preenche os dados do formulário.

import { buscarClienteInfo } from './clientes.js';

document.addEventListener('DOMContentLoaded', () => {
  const clienteInput = document.getElementById('cliente');
  if (!clienteInput) return; // Se não achar o campo, não faz nada.

  // O evento 'change' é ideal para datalists, pois dispara após a seleção.
  clienteInput.addEventListener('change', async (event) => {
    const nomeSelecionado = event.target.value;

    if (!nomeSelecionado) {
      return; // Se o campo for limpo, interrompe a execução.
    }

    const overlay = document.getElementById('appOverlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
      const info = await buscarClienteInfo(nomeSelecionado);

      if (info) {
        // Preenche os campos do formulário com os dados encontrados
        document.getElementById('endereco').value = info.endereco || '';
        document.getElementById('cnpj').value = info.cnpj || '';
        document.getElementById('ie').value = info.ie || '';
        document.getElementById('cep').value = info.cep || '';
        document.getElementById('contato').value = info.contato || '';
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
