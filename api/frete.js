// api/frete.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { to, profile, isencao = "0" } = req.body || {};
    if (!to) return res.status(400).json({ error: "Destino 'to' é obrigatório." });

    const ORS_KEY      = process.env.ORS_API_KEY;
    const ORIGIN       = process.env.ORIGIN_ADDRESS;
    const PROFILE      = profile || process.env.TRANSPORT_PROFILE || "driving-car";
    const USE_PROVIDER = process.env.USE_PROVIDER || "ors";

    if (!ORS_KEY || !ORIGIN) {
      return res.status(500).json({ error: "Faltam ORS_API_KEY/ORIGIN_ADDRESS no Vercel" });
    }

    const [olat, olon] = ORIGIN.split(",").map(Number);
    const [tlat, tlon] = String(to).split(",").map(Number);
    const coords = [[olon, olat],[tlon, tlat]];

    const url = `https://api.openrouteservice.org/v2/directions/${PROFILE}`;
    const body = { coordinates: coords };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Authorization": ORS_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(r.status).json({ error: "Falha na API de rotas", detail: txt });
    }

    const data = await r.json();
    const sum = data?.features?.[0]?.properties?.summary || {};
    return res.status(200).json({
      ok: true,
      provider: USE_PROVIDER,
      profile: PROFILE,
      origin: ORIGIN,
      to, isencao,
      distance_m: sum.distance || 0,
      duration_s: sum.duration || 0
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno", detail: e.message });
  }
}
