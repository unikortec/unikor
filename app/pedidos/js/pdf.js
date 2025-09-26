// js/pdf.js

// Funções auxiliares para formatação
function formatMoneyLocal(valor) {
  if (typeof valor === 'string') {
    valor = parseFloat(valor.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor);
}

function formatKgLocal(peso) {
  if (typeof peso === 'string') {
    peso = parseFloat(peso.replace(',', '.')) || 0;
  }
  return peso.toFixed(3).replace('.', ',') + ' kg';
}

function calcularPesoReal(item) {
  const quantidade = parseFloat(item.quantidade) || 0;
  const gramatura = parseFloat(item.gramatura) || 0;
  
  if (gramatura > 0) {
    return (quantidade * gramatura) / 1000; // converter para kg
  }
  
  return parseFloat(item.peso) || 0;
}

function calcularSubtotalReal(item) {
  const pesoReal = calcularPesoReal(item);
  let valorKg = 0;
  
  if (item.valor) {
    const valorStr = item.valor.replace(/[^\d,.-]/g, '').replace(',', '.');
    valorKg = parseFloat(valorStr) || 0;
  }
  
  return pesoReal * valorKg;
}

// Função principal para gerar PDF
async function gerarPDFCore(dados) {
  try {
    const { jsPDF } = window.jspdf || await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const doc = new jsPDF();
    
    const margemEsq = 20;
    const margemDir = 190;
    const larguraPagina = margemDir - margemEsq;
    let yAtual = 30;

    // Cabeçalho
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('PEDIDO DE COMPRA', margemEsq, yAtual);
    yAtual += 15;

    // Data
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, margemEsq, yAtual);
    doc.text(`Entrega: ${dados.dataEntrega || 'Não informado'}`, margemDir - 60, yAtual);
    yAtual += 6;
    
    if (dados.horaEntrega) {
      doc.text(`Horário: ${dados.horaEntrega}`, margemDir - 60, yAtual);
      yAtual += 6;
    }
    
    if (dados.tipoEntrega) {
      doc.text(`Tipo: ${dados.tipoEntrega}`, margemDir - 60, yAtual);
    }
    yAtual += 10;

    // Dados do Cliente
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('DADOS DO CLIENTE', margemEsq, yAtual);
    yAtual += 8;

    doc.setFont(undefined, 'normal');
    doc.text(`Cliente: ${dados.cliente}`, margemEsq, yAtual);
    yAtual += 6;

    if (dados.cnpj) {
      doc.text(`CNPJ: ${dados.cnpj}`, margemEsq, yAtual);
      yAtual += 6;
    }

    if (dados.ie) {
      doc.text(`I.E.: ${dados.ie}`, margemEsq, yAtual);
      yAtual += 6;
    }

    if (dados.telefone) {
      doc.text(`Telefone: ${dados.telefone}`, margemEsq, yAtual);
      yAtual += 6;
    }

    if (dados.endereco) {
      const linhasEndereco = doc.splitTextToSize(`Endereço: ${dados.endereco}`, larguraPagina);
      linhasEndereco.forEach(linha => {
        if (yAtual > 270) {
          doc.addPage();
          yAtual = 30;
        }
        doc.text(linha, margemEsq, yAtual);
        yAtual += 6;
      });
    }

    if (dados.cep) {
      doc.text(`CEP: ${dados.cep}`, margemEsq, yAtual);
      yAtual += 6;
    }

    yAtual += 5;

    // Itens
    doc.setFont(undefined, 'bold');
    doc.text('ITENS DO PEDIDO', margemEsq, yAtual);
    yAtual += 8;

    // Cabeçalho da tabela
    doc.setFontSize(9);
    doc.text('Descrição', margemEsq, yAtual);
    doc.text('Qtd', margemEsq + 80, yAtual);
    doc.text('Peso(Kg)', margemEsq + 100, yAtual);
    doc.text('Valor/Kg', margemEsq + 130, yAtual);
    doc.text('Subtotal', margemEsq + 155, yAtual);
    yAtual += 6;
    
    doc.line(margemEsq, yAtual, margemDir, yAtual);
    yAtual += 8;

    // Itens
    doc.setFont(undefined, 'normal');
    let totalGeral = 0;
    let totalPeso = 0;

    if (dados.itens && dados.itens.length > 0) {
      dados.itens.forEach((item, index) => {
        if (yAtual > 250) {
          doc.addPage();
          yAtual = 30;
        }

        const pesoReal = calcularPesoReal(item);
        const subtotalReal = calcularSubtotalReal(item);
        totalGeral += subtotalReal;
        totalPeso += pesoReal;

        let descricao = item.descricao || `Item ${index + 1}`;
        if (descricao.length > 35) {
          descricao = descricao.substring(0, 32) + '...';
        }

        doc.text(descricao, margemEsq, yAtual);
        doc.text(String(item.quantidade || 0), margemEsq + 80, yAtual);
        doc.text(formatKgLocal(pesoReal), margemEsq + 100, yAtual);
        doc.text(item.valor || 'R$ 0,00', margemEsq + 130, yAtual);
        doc.text(formatMoneyLocal(subtotalReal), margemEsq + 155, yAtual);
        yAtual += 8;

        if (item.gramatura && item.gramatura > 0) {
          doc.setFontSize(8);
          doc.setFont(undefined, 'italic');
          doc.text(`(${item.gramatura}g cada)`, margemEsq + 10, yAtual);
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          yAtual += 6;
        }

        if (item.observacao && item.observacao.trim()) {
          doc.setFontSize(8);
          doc.setFont(undefined, 'italic');
          const obsLinhas = doc.splitTextToSize(`Obs: ${item.observacao}`, larguraPagina - 10);
          obsLinhas.forEach(linha => {
            if (yAtual > 270) {
              doc.addPage();
              yAtual = 30;
            }
            doc.text(linha, margemEsq + 10, yAtual);
            yAtual += 5;
          });
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          yAtual += 3;
        }
      });
    }

    yAtual += 5;
    doc.line(margemEsq, yAtual, margemDir, yAtual);
    yAtual += 8;

    // Totais
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`PESO TOTAL: ${formatKgLocal(totalPeso)}`, margemEsq, yAtual);
    yAtual += 6;

    // Frete
    if (dados.valorFrete && parseFloat(dados.valorFrete) > 0) {
      doc.text(`FRETE: ${formatMoneyLocal(dados.valorFrete)}`, margemEsq, yAtual);
      totalGeral += parseFloat(dados.valorFrete);
      yAtual += 6;
    }

    doc.setFontSize(12);
    doc.text(`TOTAL GERAL: ${formatMoneyLocal(totalGeral)}`, margemEsq + 80, yAtual);
    yAtual += 10;

    // Forma de pagamento
    if (dados.formaPagamento) {
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('FORMA DE PAGAMENTO:', margemEsq, yAtual);
      yAtual += 6;
      doc.setFont(undefined, 'normal');
      doc.text(dados.formaPagamento, margemEsq, yAtual);
      yAtual += 10;
    }

    // Observações gerais
    if (dados.observacoes && dados.observacoes.trim()) {
      if (yAtual > 240) {
        doc.addPage();
        yAtual = 30;
      }
      
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

    return doc;
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw new Error('Falha ao gerar PDF: ' + error.message);
  }
}

// Função para baixar PDF
export async function gerarPDF(dados) {
  try {
    const doc = await gerarPDFCore(dados);
    const nomeArquivo = `pedido_${dados.cliente.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(nomeArquivo);
    console.log('PDF baixado:', nomeArquivo);
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw error;
  }
}

// Função para compartilhar PDF
export async function compartilharPDF(dados) {
  try {
    const doc = await gerarPDFCore(dados);
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
    throw error;
  }
}

console.log('Módulo PDF configurado');
