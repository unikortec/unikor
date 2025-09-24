// portal/api/tenant-clientes/create.js
import { tenantCol } from "../_firebase-admin.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
    const { tenantId, cliente } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok:false, error:"tenantId é obrigatório" });

    const nome = upper(cliente?.nome);
    if (!nome) return res.status(400).json({ ok:false, error:"nome é obrigatório" });

    const base = {
      nome,                       // exibe em UPPER
      nomeUpper: nome,
      nomeNormalizado: normalize(nome),
      endereco: upper(cliente?.endereco || ""),
      isentoFrete: !!cliente?.isentoFrete,
      cnpj: digits(cliente?.cnpj || ""),
      ie: upper(cliente?.ie || ""),
      cep: digits(cliente?.cep || ""),
      contato: digits(cliente?.contato || ""),
      compras: Number(cliente?.compras || 0),
      atualizadoEm: new Date(),
      criadoEm: new Date(),
    };

    // idempotência: se já existe mesmo nomeNormalizado, atualiza
    const q = await tenantCol(tenantId, "clientes").where("nomeNormalizado","==", base.nomeNormalizado).limit(1).get();
    if (!q.empty) {
      const ref = q.docs[0].ref;
      await ref.set({ ...base, criadoEm: q.docs[0].data()?.criadoEm || new Date() }, { merge:true });
      return res.json({ ok:true, reused:true, id: ref.id });
    }

    const ref = await tenantCol(tenantId, "clientes").add(base);
    return res.json({ ok:true, reused:false, id: ref.id });
  } catch (e) {
    return res.status(500).json({ ok:false, error:e.message });
  }
}

function upper(s){ return String(s||"").trim().toUpperCase(); }
function normalize(s){ return upper(s).normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function digits(v){ return String(v||"").replace(/\D/g,""); }