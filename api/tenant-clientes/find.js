// portal/api/tenant-clientes/find.js
import { tenantCol } from "../_firebase-admin.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
    const { tenantId, nome } = req.body || {};
    if (!tenantId || !nome) return res.status(400).json({ ok:false, error:"tenantId e nome são obrigatórios" });

    const alvo = normalize(nome);
    // busca por nomeNormalizado
    const snap = await tenantCol(tenantId, "clientes").where("nomeNormalizado", "==", alvo).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0]; 
      return res.json({ ok:true, found:true, id:d.id, data:d.data() });
    }

    // fallback: prefixo por nome (nomeUpper)
    const u = upper(nome);
    const end = u + "\uf8ff";
    const snap2 = await tenantCol(tenantId, "clientes")
      .orderBy("nomeUpper")
      .where("nomeUpper", ">=", u)
      .where("nomeUpper", "<=", end)
      .limit(5).get();

    if (!snap2.empty) {
      const d = snap2.docs[0];
      return res.json({ ok:true, found:true, id:d.id, data:d.data() });
    }

    return res.json({ ok:true, found:false });
  } catch (e) {
    return res.status(500).json({ ok:false, error:e.message });
  }
}

function upper(s){ return String(s||"").trim().toUpperCase(); }
function normalize(s){ return upper(s).normalize("NFD").replace(/[\u0300-\u036f]/g,""); }