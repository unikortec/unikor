// app/pedidos/js/calcular-entrega.js
export async function calcularFrete({ destinoLat, destinoLon, profile, isencao = "0" }) {
  const to = `${destinoLat},${destinoLon}`;
  const r = await fetch("/api/frete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, profile, isencao })
  });
  if (!r.ok) throw new Error((await r.json()).error || "Falha no frete");
  return r.json();
}
