// Helper isolado para reconstruir o PDF a partir de um objeto de pedido salvo,
// sem importar diretamente pdf.js (evita import circular).
import { __construirPDFBasePublic as construirPDFBase } from './pdf.js';
import { parsePesoFromProduto } from './utils.js'; // <-- IMPORTANTE: Reutilizando a função de utils.js

// ==== util de moeda/precisão igual ao PDF ====
// "12,34" | "12.34" -> 1234 (centavos)
function strToCents(str){
  const s = String(str ?? "").trim().replace(/\s+/g,"").replace(/\./g,"").replace(",",".");
  if (!s) return 0;
  return Math.round(Number(s) * 100);
}
// quantidade com até 3 casas (kg) -> milésimos
function toThousandths(n){
  return Math.round(Number(n || 0) * 1000);
}

/**
 * Recebe os dados de um pedido do Firestore e monta o PDF correspondente.
 * @param {object} pedidoDocData Os dados do documento do pedido.
 * @returns {Promise<{blob: Blob, nomeArq: string}>} O Blob do PDF e o nome do arquivo.
 */
export async function construirPDFDePedidoFirestore(pedidoDocData){
  const p = pedidoDocData || {};

  const itens = Array.isArray(p.itens) ? p.itens.map(it=>{
    const produto = String(it.produto||'').trim();
    const tipo = String(it.tipo||'KG').toUpperCase();
    const precoCents = Math.round(Number(it.precoUnit ?? it.preco ?? 0) * 100);
    const qtdNum = Number(it.quantidade ?? 0);
    const qtdTxt = String(it.quantidade ?? 0);
    
    // total inicial (se veio salvo)
    let totalCents = Math.round(Number(it.total ?? 0) * 100);

    // Se o total não estiver salvo, recalcula com a mesma lógica do PDF
    if (!totalCents){
      if (tipo === 'KG') {
        const qtdMil = toThousandths(qtdNum);
        totalCents = Math.round((qtdMil * precoCents) / 1000);
      } else { // tipo 'UN'
        // Tenta detectar o peso no nome do produto usando a função centralizada
        const pesoKg = parsePesoFromProduto(produto);
        if (pesoKg && pesoKg > 0) {
          const pesoTotalKgMil = Math.round(pesoKg * 1000 * qtdNum);
          totalCents = Math.round((pesoTotalKgMil * precoCents) / 1000);
        } else {
          // Fallback: UN * preço se não encontrar peso no nome
          totalCents = Math.round(qtdNum * precoCents);
        }
      }
    }

    return {
      produto, tipo,
      // para o motor do PDF:
      qtdTxt,
      precoTxt: (precoCents / 100).toFixed(2).replace('.', ','),
      qtdMil: toThousandths(qtdNum),
      precoCents, totalCents,
      obs: String(it.obs||'').trim(),
      _pesoTotalKgMil: 0 // Mantido para compatibilidade com a base do PDF se necessário
    };
  }) : [];

  // Monta o objeto de dados esperado pela função de construção de PDF
  const data = {
    cliente: String(p.cliente||p.clienteUpper||'').toUpperCase(),
    endereco: String(p.entrega?.endereco || p.endereco || '').toUpperCase(),
    entregaISO: p.dataEntregaISO || '',
    hora: p.horaEntrega || '',
    cnpj: String(p.clienteFiscal?.cnpj || '').replace(/\D/g,''),
    ie: String(p.clienteFiscal?.ie || '').toUpperCase(),
    cep: String(p.clienteFiscal?.cep || '').replace(/\D/g,''),
    contato: String(p.clienteFiscal?.contato || '').replace(/\D/g,''),
    obsGeralTxt: String(p.obs || p.obsGeral || '').toUpperCase(),
    tipoEnt: String(p.entrega?.tipo || 'ENTREGA').toUpperCase(),
    pagamento: String(p.pagamento || '').toUpperCase(),
    itens,
    freteLabel: (p.frete?.isento ? "ISENTO" : ("R$ " + Number(p.frete?.valorBase||0).toFixed(2))),
    freteCobravel: Number(p.frete?.valorCobravel ?? p.frete?.valorBase ?? 0)
  };

  const { blob, nomeArq } = construirPDFBase(data);
  return { blob, nomeArq };
}
