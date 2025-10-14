// functions/index.js
import functions from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";

// Node 18+ tem fetch global; sem 'node-fetch'
const allowOrigins = new Set([
  "https://app.unikor.com.br",
  "https://unikor.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function setCORS(req, res) {
  const o = req.headers.origin || "";
  if (allowOrigins.has(o)) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "3600");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

// ===== /api/frete  (distância/tempo OpenRouteService) =====
export const frete = functions.https.onRequest(
  { region: "sa-east1", timeoutSeconds: 10, memory: "256MiB" },
  async (req, res) => {
    try {
      if (setCORS(req, res)) return;
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const { to, profile, isencao = "0" } = req.body || {};
      if (!to) return res.status(400).json({ error: "Destino 'to' é obrigatório." });

      const ORS_API_KEY = process.env.ORS_API_KEY;      // ex.: setar via 'firebase functions:config:set ors.key="..."' (ou vars no console)
      const ORIGIN      = process.env.ORIGIN_ADDRESS;    // "lat,lon"
      const PROFILE     = profile || process.env.TRANSPORT_PROFILE || "driving-car";

      if (!ORS_API_KEY || !ORIGIN) {
        return res.status(500).json({ error: "Faltam ORS_API_KEY/ORIGIN_ADDRESS" });
      }

      const [olat, olon] = ORIGIN.split(",").map(Number);
      const [tlat, tlon] = String(to).split(",").map(Number);
      const coords = [[olon, olat], [tlon, tlat]];

      const url = `https://api.openrouteservice.org/v2/directions/${PROFILE}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Authorization": ORS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: coords })
      });

      if (!r.ok) {
        const txt = await r.text().catch(()=> "");
        return res.status(r.status).json({ error: "Falha na API de rotas", detail: txt });
      }

      const data = await r.json();
      const sum = data?.features?.[0]?.properties?.summary || {};
      return res.status(200).json({
        ok: true,
        profile: PROFILE,
        origin: ORIGIN,
        to, isencao,
        distance_m: sum.distance || 0,
        duration_s: sum.duration || 0
      });
    } catch (e) {
      logger.error("[frete] err", e);
      return res.status(500).json({ error: "Erro interno" });
    }
  }
);

// ===== /api/calcular-entrega  (geocode + regra preço) =====
export const calcularEntrega = functions.https.onRequest(
  { region: "sa-east1", timeoutSeconds: 10, memory: "256MiB" },
  async (req, res) => {
    try {
      if (setCORS(req, res)) return;
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const { enderecoTexto, totalItens = 0, clienteIsento = false } = req.body || {};
      if (!enderecoTexto || typeof enderecoTexto !== "string") {
        return res.status(400).json({ error: "Campo 'enderecoTexto' é obrigatório." });
      }

      // Isenção manual (checkbox)
      if (clienteIsento) {
        return res.status(200).json({
          ok: true, isento: true, labelIsencao: "(ISENTO manual)",
          valorBase: 0, valorCobravel: 0, meta: { motivo: "manual" }
        });
      }

      const ORS_API_KEY = process.env.ORS_API_KEY;
      if (!ORS_API_KEY) return res.status(500).json({ error: "Falta ORS_API_KEY" });

      // Geocode by OpenRouteService
      const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(ORS_API_KEY)}&text=${encodeURIComponent(enderecoTexto)}&size=1`;
      const g = await fetch(geocodeUrl);
      if (!g.ok) return res.status(502).json({ error: "Falha no geocoding" });
      const gj = await g.json();
      const feat = gj?.features?.[0];
      if (!feat) return res.status(404).json({ error: "Endereço não encontrado" });
      const [destLon, destLat] = feat.geometry?.coordinates || [];

      // Distância chamando nossa própria rota /api/frete
      const fr = await fetch(`${req.protocol || "https"}://${req.get("host")}/api/frete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: `${destLat},${destLon}`, profile: process.env.TRANSPORT_PROFILE || "driving-car" })
      }).catch(()=>null);

      let distance_m = 0;
      if (fr && fr.ok) {
        const fj = await fr.json();
        distance_m = Number(fj?.distance_m || 0);
      }

      // Regra simples (ajuste a sua real)
      let isento = false;
      let labelIsencao = "";
      let valorBase = 0;

      if (Number(totalItens) >= 1500) {
        isento = true; labelIsencao = "(ISENTO por valor)"; valorBase = 0;
      } else {
        const km = distance_m / 1000;
        if (km <= 1.5)      valorBase = 8;
        else if (km <= 5)   valorBase = 15;
        else if (km <= 10)  valorBase = 25;
        else                valorBase = 35 + Math.ceil(km - 10) * 2;
      }

      const valorCobravel = isento ? 0 : valorBase;
      return res.status(200).json({
        ok: true, isento, labelIsencao, valorBase, valorCobravel,
        meta: { distance_m, totalItens: Number(totalItens)||0 }
      });
    } catch (e) {
      logger.error("[calcular-entrega] err", e);
      return res.status(500).json({ error: "Erro interno" });
    }
  }
);
