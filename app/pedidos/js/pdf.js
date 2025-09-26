import { formatMoney, parseMoney, formatKg, parseKg } from './utils.js';

console.log('Módulo PDF carregado');

// Função para calcular peso correto baseado na gramatura
function calcularPesoReal(item) {
  // Se já tem peso definido, usa ele
  if (item.pesoNumerico && item.pesoNumerico > 0) {
    return item.pesoNumerico;
  }
  
  // Se tem gramatura, calcula: (quantidade * gramatura) / 1000
  if (item.gramatura && item.gramatura > 0 && item.quantidade > 0) {
    return (item.quantidade * item.gramatura) / 1000;
  }
  
  return 0;
}

// Função para calcular subtotal correto
function calcularSubtotalReal(item) {
  const peso = calcularPesoReal(item);
  const valor = item.valorNumerico || 0;
  
  // Se tem peso, usa peso * valor/kg
  if (peso > 0) {
    return peso * valor;
  }
  
  // Senão, usa quantidade * valor unitário
  return (item.quantidade || 0) * valor;
}

export async function gerarPDF(dados) {
  console.log('Gerando PDF com dados:', dados);
  
  try {
    // Importa jsPDF dinamicamente
    const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    
    const doc = new jsPDF();
    
    // Configurações
    const margemEsq = 20;
    const margemDir = 190;
    const larguraPagina = margemDir - margemEsq;
    let yAtual = 30;
    
    // Título
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('PEDIDO DE COMPRA', margemEsq, yAtual);
    yAtual += 15;
    
    // Data
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, margemEsq, yAtual);
    yAtual += 10;
    
    // Dados do cliente
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('DADOS DO CLIENTE', margemEsq, yAtual);
    yAtual += 8;
    
    doc.setFont(undefined, 'normal');
    doc.text(`Cliente: ${dados.cliente}`, margemEsq, yAtual);
    yAtual += 6;
    
    if (dados.telefone) {
      doc.text(`Telefone: ${dados.telefone}`, margemEsq, yAtual);
      yAtual += 6;
    }
    
    if (dados.endereco) {
      doc.text(`Endereço: ${dados.endereco}`, margemEsq, yAtual);
      yAtual += 6;
    }
    
    yAtual += 5;
    
    // Cabeçalho da tabela
    doc.setFont(undefined, 'bold');
    doc.text('ITENS', margemEsq, yAtual);
    yAtual += 8;
    
    // Headers da tabela
    doc.setFontSize(9);
    doc.text('Descrição', margemEsq, yAtual);
    doc.text('Qtd', margemEsq + 80, yAtual);
    doc.text('Peso(Kg)', margemEsq + 100, yAtual);
    doc.text('Valor/Kg', margemEsq + 130, yAtual);
    doc.text('Subtotal', margemEsq + 155, yAtual);
    yAtual += 6;
    
    // Linha separadora
    doc.line(margemEsq, yAtual, margemDir, yAtual);
    yAtual += 8;
    
    // Itens
    doc.setFont(undefined, 'normal');
    let totalGeral = 0;
    
    dados.itens.forEach((item, index) => {
      // Verifica se precisa de nova página
      if (yAtual > 250) {
        doc.addPage();
        yAtual = 30;
      }
      
      // Calcula valores corretos
      const pesoReal = calcularPesoReal(item);
      const subtotalReal = calcularSubtotalReal(item);
      totalGeral += subtotalReal;
      
      // Descrição (trunca se muito longa)
      let descricao = item.descricao || `Item ${index + 1}`;
      if (descricao.length > 35) {
        descricao = descricao.substring(0, 32) + '...';
      }
      
      doc.text(descricao, margemEsq, yAtual);
      doc.text(String(item.quantidade || 0), margemEsq + 80, yAtual);
      doc.text(formatKg(pesoReal), margemEsq + 100, yAtual);
      doc.text(item.valor || 'R$ 0,00', margemEsq + 130, yAtual);
      doc.text(formatMoney(subtotalReal), margemEsq + 155, yAtual);
      
      yAtual += 8;
      
      // Se tem gramatura, mostra info adicional
      if (item.gramatura && item.gramatura > 0) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        doc.text(`(${item.gramatura}g cada)`, margemEsq + 10, yAtual);
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        yAtual += 6;
      }
    });
    
    yAtual += 5;
    
    // Linha separadora do total
    doc.line(margemEsq, yAtual, margemDir, yAtual);
    yAtual += 8;
    
    // Total
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`TOTAL: ${formatMoney(totalGeral)}`, margemEsq + 100, yAtual);
    
    // Observações
    if (dados.observacoes && dados.observacoes.trim()) {
      yAtual += 15;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('OBSERVAÇÕES:', margemEsq, yAtual);
      yAtual += 8;
      
      doc.setFont(undefined, 'normal');
      const linhasObs = doc.splitTextToSize(dados.observacoes, larguraPagina);
      linhasObs.forEach(linha => {
        if (yAtual > 270) {
          doc.addPage();
          yAtual = 30;
        }
        doc.text(linha, margemEsq, yAtual);
        yAtual += 6;
      });
    }
    
    // Salva o PDF
    const nomeArquivo = `pedido_${dados.cliente.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(nomeArquivo);
    
    console.log('PDF salvo:', nomeArquivo);
    
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw new Error('Falha ao gerar PDF: ' + error.message);
  }
}

export async function compartilharPDF(dados) {
  try {
    // Importa jsPDF dinamicamente
    const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    
    const doc = new jsPDF();
    
    // Configurações
    const margemEsq = 20;
    const margemDir = 190;
    const larguraPagina = margemDir - margemEsq;
    let yAtual = 30;
    
    // Título
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('PEDIDO DE COMPRA', margemEsq, yAtual);
    yAtual += 15;
    
    // Data
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, margemEsq, yAtual);
    yAtual += 10;
    
    // Dados do cliente
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('DADOS DO CLIENTE', margemEsq, yAtual);
    yAtual += 8;
    
    doc.setFont(undefined, 'normal');
    doc.text(`Cliente: ${dados.cliente}`, margemEsq, yAtual);
    yAtual += 6;
    
    if (dados.telefone) {
      doc.text(`Telefone: ${dados.telefone}`, margemEsq, yAtual);
      yAtual += 6;
    }
    
    if (dados.endereco) {
      doc.text(`Endereço: ${dados.endereco}`, margemEsq, yAtual);
      yAtual += 6;
    }
    
    yAtual += 5;
    
    // Cabeçalho da tabela
    doc.setFont(undefined, 'bold');
    doc.text('ITENS', margemEsq, yAtual);
    yAtual += 8;
    
    // Headers da tabela
    doc.setFontSize(9);
    doc.text('Descrição', margemEsq, yAtual);
    doc.text('Qtd', margemEsq + 80, yAtual);
    doc.text('Peso(Kg)', margemEsq + 100, yAtual);
    doc.text('Valor/Kg', margemEsq + 130, yAtual);
    doc.text('Subtotal', margemEsq + 155, yAtual);
    yAtual += 6;
    
    // Linha separadora
    doc.line(margemEsq, yAtual, margemDir, yAtual);
    yAtual += 8;
    
    // Itens
    doc.setFont(undefined, 'normal');
    let totalGeral = 0;
    
    dados.itens.forEach((item, index) => {
      // Verifica se precisa de nova página
      if (yAtual > 250) {
        doc.addPage();
        yAtual = 30;
      }
      
      // Calcula valores corretos
      const pesoReal = calcularPesoReal(item);
      const subtotalReal = calcularSubtotalReal(item);
      totalGeral += subtotalReal;
      
      // Descrição (trunca se muito longa)
      let descricao = item.descricao || `Item ${index + 1}`;
      if (descricao.length > 35) {
        descricao = descricao.substring(0, 32) + '...';
      }
      
      doc.text(descricao, margemEsq, yAtual);
      doc.text(String(item.quantidade || 0), margemEsq + 80, yAtual);
      doc.text(formatKg(pesoReal), margemEsq + 100, yAtual);
      doc.text(item.valor || 'R$ 0,00', margemEsq + 130, yAtual);
      doc.text(formatMoney(subtotalReal), margemEsq + 155, yAtual);
      
      yAtual += 8;
      
      // Se tem gramatura, mostra info adicional
      if (item.gramatura && item.gramatura > 0) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        doc.text(`(${item.gramatura}g cada)`, margemEsq + 10, yAtual);
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        yAtual += 6;
      }
    });
    
    yAtual += 5;
    
    // Linha separadora do total
    doc.line(margemEsq, yAtual, margemDir, yAtual);
    yAtual += 8;
    
    // Total
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`TOTAL: ${formatMoney(totalGeral)}`, margemEsq + 100, yAtual);
    
    // Observações
    if (dados.observacoes && dados.observacoes.trim()) {
      yAtual += 15;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('OBSERVAÇÕES:', margemEsq, yAtual);
      yAtual += 8;
      
      doc.setFont(undefined, 'normal');
      const linhasObs = doc.splitTextToSize(dados.observacoes, larguraPagina);
      linhasObs.forEach(linha => {
        if (yAtual > 270) {
          doc.addPage();
          yAtual = 30;
        }
        doc.text(linha, margemEsq, yAtual);
        yAtual += 6;
      });
    }
    
    // Gera blob para compartilhamento
    const pdfBlob = doc.output('blob');
    const nomeArquivo = `pedido_${dados.cliente.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    
    // Verifica se o navegador suporta Web Share API
    if (navigator.share && navigator.canShare) {
      const file = new File([pdfBlob], nomeArquivo, { type: 'application/pdf' });
      
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Pedido de Compra',
          text: `Pedido para ${dados.cliente}`
        });
        console.log('PDF compartilhado via Web Share API');
        return;
      }
    }
    
    // Fallback: criar link de download
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);
    
    console.log('PDF baixado como fallback');
    
  } catch (error) {
    console.error('Erro ao compartilhar PDF:', error);
    throw new Error('Falha ao compartilhar PDF: ' + error.message);
  }
}

console.log('Módulo PDF configurado');
