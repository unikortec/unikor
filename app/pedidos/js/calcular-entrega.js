// app/pedidos/js/calcular-entrega.js
// Compat com código antigo: usa /api/frete (to=lat,lon) e retorna o JSON bruto da rota.
export async function calcularFrete({ destinoLat, destinoLon, profile, isencao = "0" }) {
  const to = `${destinoLat},${destinoLon}`;
  const base = (location.pathname.startsWith("/app/") ? "/app" : "");
  const r = await fetch(`${base}/api/frete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, profile, isencao })
  });
  if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || "Falha no frete");
  return r.json();
}