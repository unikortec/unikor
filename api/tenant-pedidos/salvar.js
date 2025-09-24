// portal/api/tenant-pedidos/salvar.js
import { tenantCol } from "../_firebase-admin.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
    const { tenantId, idempotencyKey, payload } = req.body || {};
    if (!tenantId || !idempotencyKey || !payload) {
      return res.status(400).json({ ok:false, error:"tenantId, idempotencyKey e payload são obrigatórios" });
    }

    // já existe?
    const snap = await tenantCol(tenantId, "pedidos").where("idempotencyKey","==", idempotencyKey).limit(1).get();
    if (!snap.empty) {
      return res.json({ ok:true, reused:true, id: snap.docs[0].id });
    }

    const doc = {
      ...payload,
      idempotencyKey,
      dataEntregaDia: payload.dataEntregaISO ? Number(String(payload.dataEntregaISO).replaceAll("-","")) : null,
      createdAt: new Date(),
    };
    const ref = await tenantCol(tenantId, "pedidos").add(doc);
    return res.json({ ok:true, reused:false, id: ref.id });
  } catch (e) {
    return res.status(500).json({ ok:false, error:e.message });
  }
}