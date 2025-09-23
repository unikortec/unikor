// portal/api/tenant-pedidos/salvar.js
import { getDb } from "../../api/_firebase-admin";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { tenantId, payload, idempotencyKey } = req.body || {};
    if (!tenantId) return res.status(400).json({ error: "tenantId é obrigatório" });
    if (!payload || typeof payload !== "object") return res.status(400).json({ error: "payload inválido" });
    if (!idempotencyKey) return res.status(400).json({ error: "idempotencyKey é obrigatório" });

    const db = getDb();
    const col = db.collection("tenants").doc(tenantId).collection("pedidos");

    // 1) checa idempotência
    const existing = await col.where("idempotencyKey", "==", idempotencyKey).limit(1).get();
    if (!existing.empty) {
      return res.status(200).json({ ok: true, reused: true, id: existing.docs[0].id });
    }

    // 2) cria novo
    const docRef = await col.add({
      ...payload,
      idempotencyKey,
      createdAt: new Date()
    });

    return res.status(200).json({ ok: true, reused: false, id: docRef.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erro interno", detail: e.message });
  }
}