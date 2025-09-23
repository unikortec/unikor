// portal/api/tenant-clientes/top.js
import { getDb } from "../_firebase-admin";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const tenantId = req.query.tenantId;
    const n = Math.min(parseInt(req.query.n || "50", 10), 200);
    if (!tenantId) return res.status(400).json({ error: "tenantId é obrigatório" });

    const db = getDb();
    const qs = await db
      .collection("tenants").doc(tenantId)
      .collection("clientes")
      .orderBy("compras", "desc")
      .limit(n)
      .get();

    const out = [];
    qs.forEach(d => {
      const x = d.data() || {};
      const nome = (x.nome || x.nomeUpper || "").toString().trim();
      if (nome) out.push(nome);
    });

    return res.status(200).json({ ok: true, itens: out });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erro interno", detail: e.message });
  }
}