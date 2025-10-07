// app/pedidos/js/storageQueueHelpers.js
// Helper isolado para reconstruir o PDF a partir de um objeto de pedido salvo,
// sem importar diretamente pdf.js (evita import circular).
import { __construirPDFBasePublic as construirPDFBase } from './pdf.js';

/**
 * Recebe o objeto "pedido" (snap.data()) e monta o PDF usando o miolo base.
 * Retorna { blob, nomeArq }.
 */
export async function construirPDFDePedidoFirestore(pedidoDocData){
  const p = pedidoDocData || {};
  const itens = Array.isArray(p.itens) ? p.itens.map(it=>{
    const produto = String(it.produto||'').trim();
    const tipo = String(it.tipo||'KG').toUpperCase();

    // preferimos total salvo; se não houver, calculamos:
    const precoCents = Math.round(Number(it.precoUnit ?? it.preco ?? 0) * 100);
    const qtdTxt = String(it.quantidade ?? 0);
    const qtdMil = Math.round(Number(it.quantidade ?? 0) * 1000);
    let totalCents = Math.round(Number(it.total ?? 0) * 100);
    if (!totalCents){
      if (tipo === 'KG') totalCents = Math.round((qtdMil * precoCents) / 1000);
      else               totalCents = Math.round((Number(qtdTxt) || 0) * precoCents);
    }

    return {
      produto, tipo,
      qtdTxt,
      precoTxt: (Number(precoCents)/100).toFixed(2).replace('.', ','),
      qtdMil, precoCents, totalCents,
      obs: String(it.obs||'').trim(),
      _pesoTotalKgMil: 0
    };
  }) : [];

  // shape esperado pelo construirPDFBase
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

  const { doc } = construirPDFBase(data);
  const blob = doc.output('blob');

  // mesmo gerador de nome do pdf.js
  const [ano,mes,dia] = String(data.entregaISO||'').split('-');
  const aa=(ano||'').slice(-2)||'AA';
  const hh=(data.hora||'').slice(0,2)||'HH';
  const mm=(data.hora||'').slice(3,5)||'MM';
  const nomeArq = `${(String(data.cliente||'Cliente').split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()+s.slice(1).toLowerCase()).join('')||'Cliente').replace(/[^A-Za-z0-9]/g,'')}_${dia||'DD'}_${mes||'MM'}_${aa}_H${hh}-${mm}.pdf`;

  return { blob, nomeArq };
}