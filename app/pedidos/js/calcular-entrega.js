// portal/app/pedidos/js/calcular-entrega.js
export async function calcularEntregaDireto({ enderecoTexto, totalItens = 0, clienteIsento = false }) {
  if (!enderecoTexto) throw new Error("enderecoTexto é obrigatório");

  const r = await fetch("/portal/api/calcular-entrega", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enderecoTexto, totalItens, clienteIsento })
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`/portal/api/calcular-entrega -> HTTP ${r.status} ${txt}`);
  }
  return r.json();
}