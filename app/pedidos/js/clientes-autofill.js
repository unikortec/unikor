// Arquivo: /app/pedidos/js/clientes-autofill.js
// Este arquivo escuta a seleção de um cliente e preenche os dados do formulário.

import { buscarClienteInfo } from './clientes.js';

document.addEventListener('DOMContentLoaded', () => {
  const clienteInput = document.getElementById('cliente');

  // Verifica se o campo de cliente realmente existe na página
  if (!clienteInput) {
    console.error('ERRO CRÍTICO: O campo de input com id="cliente" não foi encontrado.');
    return;
  }

  // Usamos o evento 'change' que é mais confiável para datalists.
  // Ele dispara quando o usuário seleciona um item e o campo perde o foco.
  clienteInput.addEventListener('change', async (event) => {
    const nomeSelecionado = event.target.value;

    // Se o campo for limpo, não faz nada
    if (!nomeSelecionado) {
      console.log('Campo de cliente foi limpo.');
      return;
    }

    // --- PONTO DE TESTE 1 ---
    // Verifica se o evento está funcionando e qual nome ele pegou.
    console.log(`Evento 'change' disparado. Buscando dados para: "${nomeSelecionado}"`);

    // Mostra um spinner/overlay para o usuário saber que algo está acontecendo
    const overlay = document.getElementById('appOverlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
      const info = await buscarClienteInfo(nomeSelecionado);

      // --- PONTO DE TESTE 2 ---
      // Verifica o que a função buscarClienteInfo retornou.
      console.log('Dados recebidos do Firebase:', info);

      if (info) {
        // --- PONTO DE TESTE 3 ---
        // Se recebemos dados, vamos tentar preencher os campos.
        console.log('Dados encontrados. Preenchendo os campos do formulário.');
        document.getElementById('endereco').value = info.endereco || '';
        document.getElementById('cnpj').value = info.cnpj || '';
        document.getElementById('ie').value = info.ie || '';
        document.getElementById('cep').value = info.cep || '';
        document.getElementById('contato').value = info.contato || '';
        // Adicione aqui outros campos se necessário, sempre com `|| ''` para segurança.
      } else {
        // --- PONTO DE TESTE 4 ---
        // Se não recebemos dados, saberemos aqui.
        console.warn(`AVISO: Nenhum dado encontrado para o cliente "${nomeSelecionado}". Verifique se o nome corresponde exatamente ao ID do documento no Firebase (maiúsculas, sem espaços extras).`);
      }
    } catch (error) {
      console.error("Ocorreu um erro ao buscar as informações do cliente:", error);
    } finally {
      // Esconde o spinner/overlay
      if (overlay) overlay.classList.add('hidden');
    }
  });
});
