// portal/api/tenant-clientes/find.js
import { getDb } from "../_firebase-admin";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { tenantId, nome } = req.body || {};
    if (!tenantId || !nome) return res.status(400).json({ error: "tenantId e nome são obrigatórios" });

    const up = (s) => String(s || "").trim().toUpperCase();
    const removeAcentos = (s) => String(s || "").normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const norm = (s) => removeAcentos(up(s));

    const db = getDb();
    const snap = await db
      .collection("tenants").doc(tenantId)
      .collection("clientes")
      .where("nomeNormalizado", "==", norm(nome))
      .limit(1)
      .get();

    if (snap.empty) return res.status(404).json({ ok: true, found: false });

    const doc = snap.docs[0];
    return res.status(200).json({ ok: true, found: true, id: doc.id, data: doc.data() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erro interno", detail: e.message });
  }
}