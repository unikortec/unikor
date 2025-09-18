// Chama o endpoint de frete da Vercel (projeto UNIKOR).
// Garanta as VARS no Vercel: ORS_API_KEY, USE_PROVIDER, ORIGIN_ADDRESS, TRANSPORT_PROFILE, ISENCAO_NIVEL etc.
export async function calcularFrete(payload){
  const res = await fetch('/api/frete', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Frete: falha na API.');
  return res.json(); // { valor, distancia, duracao, ... }
}
