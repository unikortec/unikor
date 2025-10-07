// Pequeno helper chamado pela fila para reconstruir o PDF a partir do payload salvo
// (isolado para não criar import circular com pdf.js)

export async function construirPDFDePedidoFirestore(pedidoDocData){
  const { normalizarPedidoSalvo, construirPDFBase } = await import("./storagePdfCore.js");
  const norm = normalizarPedidoSalvo(pedidoDocData);
  return construirPDFBase(norm);
}