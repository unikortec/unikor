// portal/api/calcular-entrega.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { enderecoTexto, totalItens = 0, clienteIsento = false } = req.body || {};
    if (!enderecoTexto || typeof enderecoTexto !== "string") {
      return res.status(400).json({ error: "Campo 'enderecoTexto' é obrigatório." });
    }

    // 1) Isenção manual
    if (clienteIsento) {
      return res.status(200).json({
        ok: true,
        isento: true,
        labelIsencao: "(ISENTO manual)",
        valorBase: 0,
        valorCobravel: 0,
        meta: { motivo: "manual" }
      });
    }

    // 2) Resolve coordenadas destino (geocoding leve via ORS)
    const ORS_KEY = process.env.ORS_API_KEY;
    if (!ORS_KEY) return res.status(500).json({ error: "Falta ORS_API_KEY" });

    const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(ORS_KEY)}&text=${encodeURIComponent(enderecoTexto)}&size=1`;
    const g = await fetch(geocodeUrl);
    if (!g.ok) return res.status(502).json({ error: "Falha no geocoding" });
    const gj = await g.json();
    const feat = gj?.features?.[0];
    if (!feat) return res.status(404).json({ error: "Endereço não encontrado" });
    const [destLon, destLat] = feat.geometry?.coordinates || [];

    // 3) Distância/tempo via nosso endpoint interno /api/frete
    const fr = await fetch(`${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : ""}/api/frete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: `${destLat},${destLon}`,
        profile: process.env.TRANSPORT_PROFILE || "driving-car"
      })
    }).catch(()=>null);

    let distance_m = 0;
    if (fr && fr.ok) {
      const fj = await fr.json();
      distance_m = Number(fj?.distance_m || 0);
    }

    // 4) regra de preço (exemplo simples & estável)
    //    - compras grandes: isento
    //    - degraus por distância
    let isento = false;
    let labelIsencao = "";
    let valorBase = 0;

    if (Number(totalItens) >= 1500) {
      isento = true;
      labelIsencao = "(ISENTO por valor)";
      valorBase = 0;
    } else {
      const km = distance_m / 1000;
      if (km <= 1.5)      valorBase = 8;
      else if (km <= 5)   valorBase = 15;
      else if (km <= 10)  valorBase = 25;
      else                valorBase = 35 + Math.ceil(km - 10) * 2;
    }

    const valorCobravel = isento ? 0 : valorBase;

    return res.status(200).json({
      ok: true,
      isento, labelIsencao,
      valorBase, valorCobravel,
      meta: { distance_m, totalItens: Number(totalItens)||0 }
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno", detail: e.message });
  }
}