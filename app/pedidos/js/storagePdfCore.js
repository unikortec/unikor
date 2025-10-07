// Extrai partes reutilizáveis do pdf.js para uso na fila (sem side-effects)

const { jsPDF } = window.jspdf;

// *** Copiadas do pdf.js ***
// (1) normalizarPedidoSalvo (mesmo corpo do seu pdf.js)
export function normalizarPedidoSalvo(p){
  const itens = Array.isArray(p.itens) ? p.itens.map(it=>({
    produto: String(it.produto||'').trim(),
    tipo: (it.tipo||'KG').toUpperCase(),
    quantidade: Number(it.quantidade||0),
    preco: Number(it.precoUnit||it.preco||0),
    obs: String(it.obs||'').trim(),
    total: Number(it.total || (Number(it.quantidade||0)*Number(it.precoUnit||it.preco||0)))
  })) : [];

  const digitsOnly = (v)=> String(v||'').replace(/\D/g,'');

  return {
    cliente: String(p.cliente||p.clienteUpper||'').toUpperCase(),
    endereco: String(p.entrega?.endereco || p.endereco || '').toUpperCase(),
    entregaISO: p.dataEntregaISO || '',
    hora: p.horaEntrega || '',
    cnpj: digitsOnly(p.clienteFiscal?.cnpj || ''),
    ie: String(p.clienteFiscal?.ie || '').toUpperCase(),
    cep: digitsOnly(p.clienteFiscal?.cep || ''),
    contato: digitsOnly(p.clienteFiscal?.contato || ''),
    obsGeralTxt: String(p.obs || p.obsGeral || '').toUpperCase(),
    tipoEnt: String(p.entrega?.tipo || 'ENTREGA').toUpperCase(),
    pagamento: String(p.pagamento || '').toUpperCase(),
    itens,
    freteLabel: (p.frete?.isento ? "ISENTO" : ("R$ " + Number(p.frete?.valorBase||0).toFixed(2))),
    freteCobravel: Number(p.frete?.valorCobravel ?? p.frete?.valorBase ?? 0)
  };
}

// (2) construirPDFBase — use exatamente a MESMA função do seu pdf.js.
// Para não duplicar centenas de linhas, importamos dinamicamente dela:
export async function construirPDFBase(data){
  const pdf = await import("./pdf.js");
  // aproveita o mesmo miolo de desenho
  return pdf.__construirPDFBasePublic?.(data);
}