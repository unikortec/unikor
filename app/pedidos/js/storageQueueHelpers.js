// app/pedidos/js/storageQueueHelpers.js
// Helper isolado para reconstruir o PDF a partir de um objeto de pedido salvo,
// sem importar diretamente pdf.js (evita import circular).
import { __construirPDFBasePublic as construirPDFBase } from './pdf.js';

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
 * Recebe o objeto "pedido" (snap.data()) e monta o PDF usando o miolo base.
 * Retorna { blob, nomeArq }.
 */
export async function construirPDFDePedidoFirestore(pedidoDocData){
  const p = pedidoDocData || {};

  const itens = Array.isArray(p.itens) ? p.itens.map(it=>{
    const produto = String(it.produto||'').trim();
    const tipo = String(it.tipo||'KG').toUpperCase();

    // Preferimos o total salvo; se não houver, recalculamos com a mesma regra do PDF
    const precoCents = Math.round(Number(it.precoUnit ?? it.preco ?? 0) * 100);

    // preserva o que estava salvo (texto simples é opcional nos docs antigos)
    const qtdNum = Number(it.quantidade ?? 0);
    const qtdTxt = String(it.quantidade ?? 0);

    // total inicial (se veio salvo)
    let totalCents = Math.round(Number(it.total ?? 0) * 100);

    if (!totalCents){
      if (tipo === 'KG') {
        // milésimos de kg * preço
        const qtdMil = toThousandths(qtdNum);
        totalCents = Math.round((qtdMil * precoCents) / 1000);
      } else {
        // tipo UN — tenta detectar peso no nome (120g, 1.2kg, etc) como no PDF
        let pesoTotalKgMil = 0; // milésimos de kg
        const s = produto.toLowerCase().replace(',', '.').replace(/\s+/g,' ');
        const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b\.?/g;
        let m, last=null; while((m=re.exec(s))!==null) last=m;
        if (last){
          const raw = String(last[1]).replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'');
          const val = parseFloat(raw);
          if (isFinite(val) && val>0){
            const unit = last[2].toLowerCase();
            const kgUn = (unit.startsWith('kg') || unit.startsWith('quilo')) ? val : (val/1000);
            pesoTotalKgMil = Math.round(kgUn * 1000 * (qtdNum || 0));
          }
        }
        if (pesoTotalKgMil > 0) {
          totalCents = Math.round((pesoTotalKgMil * precoCents) / 1000);
        } else {
          // fallback: UN * preço
          totalCents = Math.round((qtdNum || 0) * precoCents);
        }
      }
    }

    return {
      produto, tipo,
      // para o motor do PDF:
      qtdTxt,
      precoTxt: (Number(precoCents)/100).toFixed(2).replace('.', ','),
      qtdMil: toThousandths(qtdNum),
      precoCents, totalCents,
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

  // usar o blob/nome que o próprio miolo já retorna (evita re-serializar)
  const { blob, nomeArq } = construirPDFBase(data);
  return { blob, nomeArq };
}