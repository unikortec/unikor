// portal/api/calcular-entrega.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { enderecoTexto, totalItens = 0, clienteIsento = false } = req.body || {};
    if (!enderecoTexto) {
      return res.status(200).json({
        valorBase: 0,
        valorCobravel: 0,
        isento: false,
        labelIsencao: "",
        _vazio: true
      });
    }

    // isenção manual pelo app
    if (clienteIsento) {
      return res.status(200).json({
        valorBase: 0,
        valorCobravel: 0,
        isento: true,
        labelIsencao: "(ISENTO pelo cliente)"
      });
    }

    const ORS_KEY  = process.env.ORS_API_KEY;
    const ORIGIN   = process.env.ORIGIN_ADDRESS; // "-30.0277,-51.2287"
    const PROFILE  = process.env.TRANSPORT_PROFILE || "driving-car";

    if (!ORS_KEY || !ORIGIN) {
      // Sem ORS configurado → frete 0 (app continua funcionando)
      return res.status(200).json({
        valorBase: 0,
        valorCobravel: 0,
        isento: false,
        labelIsencao: "(sem ORS configurado)"
      });
    }

    // 1) geocodifica destino pelo ORS
    const geocode = await fetch(
      `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(ORS_KEY)}&text=${encodeURIComponent(enderecoTexto)}&size=1`
    );
    const gdata = await geocode.json();
    const feat = gdata?.features?.[0];
    if (!feat) {
      return res.status(200).json({
        valorBase: 0,
        valorCobravel: 0,
        isento: false,
        labelIsencao: "(destino não encontrado)"
      });
    }
    const [destLon, destLat] = feat.geometry.coordinates.map(Number);

    // 2) directions ORS
    const [oLat, oLon] = ORIGIN.split(",").map(Number);
    const body = { coordinates: [[oLon, oLat], [destLon, destLat]] };
    const url = `https://api.openrouteservice.org/v2/directions/${PROFILE}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Authorization": ORS_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return res.status(200).json({
        valorBase: 0,
        valorCobravel: 0,
        isento: false,
        labelIsencao: "(falha no cálculo de rota)"
      });
    }

    const data = await r.json();
    const sum = data?.features?.[0]?.properties?.summary || {};
    const distanceKm = (sum.distance || 0) / 1000;

    // 3) regra simples de preço (ajuste à vontade)
    //   - bandeirada 8,00
    //   - 2,50 por km
    //   - mínimo 12,00
    let valor = 8 + distanceKm * 2.5;
    if (valor < 12) valor = 12;

    // exemplo: pedidos altos podem zerar frete (limite ajustável)
    const LIMITE_ISENCAO = 600;
    const isentoPorValor = Number(totalItens) >= LIMITE_ISENCAO;

    const valorBase = isentoPorValor ? 0 : Number(valor.toFixed(2));
    const valorCobravel = valorBase; // aqui não há taxas extras

    return res.status(200).json({
      valorBase,
      valorCobravel,
      isento: isentoPorValor,
      labelIsencao: isentoPorValor ? `(pedido ≥ R$ ${LIMITE_ISENCAO})` : "",
      distance_km: Number(distanceKm.toFixed(2)),
      duration_s: sum.duration || 0
    });
  } catch (e) {
    return res.status(200).json({
      valorBase: 0,
      valorCobravel: 0,
      isento: false,
      labelIsencao: "(erro interno no frete)"
    });
  }
}