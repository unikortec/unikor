// portal/api/tenant-pedidos/salvar.js
import { db, tenantCol } from "../_firebase-admin.js";

// CORS simples (libera app.unikor.com.br, produção Vercel e localhost)
const ALLOW_ORIGINS = new Set([
  "https://app.unikor.com.br",
  "https://unikor.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function withCORS(res, origin) {
  if (origin && ALLOW_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  withCORS(res, req.headers.origin);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { tenantId, payload, idempotencyKey } = req.body || {};
    const tenant = (tenantId || process.env.TENANT_DEFAULT || "").trim();

    if (!tenant) {
      return res.status(400).json({ error: "tenantId ausente e TENANT_DEFAULT não configurado" });
    }
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "payload inválido" });
    }
    if (!idempotencyKey) {
      return res.status(400).json({ error: "idempotencyKey é obrigatório" });
    }

    // 1) tenta reaproveitar (consulta por índice de idempotencyKey)
    const col = tenantCol(tenant, "pedidos");
    const snap = await col.where("idempotencyKey", "==", idempotencyKey).limit(1).get();

    if (!snap.empty) {
      return res.status(200).json({ ok: true, reused: true, id: snap.docs[0].id });
    }

    // 2) salva o pedido
    const toSave = {
      ...payload,
      idempotencyKey,
      tenantId: tenant,
      createdAt: new Date(),
      dataEntregaDia: payload?.dataEntregaISO
        ? Number(String(payload.dataEntregaISO).replaceAll("-", ""))
        : null,
    };

    const ref = await col.add(toSave);

    return res.status(200).json({ ok: true, reused: false, id: ref.id });
  } catch (err) {
    console.error("Erro /tenant-pedidos/salvar:", err);
    return res.status(500).json({ error: "Erro interno", detail: err.message });
  }
}