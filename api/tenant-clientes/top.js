// portal/api/tenant-clientes/top.js
import { tenantCol } from "../_firebase-admin.js";

export default async function handler(req, res) {
  try {
    const { tenantId, n } = req.query || {};
    if (!tenantId) return res.status(400).json({ ok:false, error:"tenantId é obrigatório" });
    const limitN = Math.min(Number(n||50), 200);

    let out = [];
    const snap = await tenantCol(tenantId, "clientes").orderBy("compras","desc").limit(limitN).get();
    if (!snap.empty) {
      out = snap.docs.map(d => d.data()?.nome || d.data()?.nomeUpper).filter(Boolean);
    } else {
      const snap2 = await tenantCol(tenantId, "clientes").orderBy("nomeUpper").limit(limitN).get();
      out = snap2.docs.map(d => d.data()?.nome || d.data()?.nomeUpper).filter(Boolean);
    }
    return res.json({ ok:true, itens: out });
  } catch (e) {
    return res.status(500).json({ ok:false, error:e.message });
  }
}