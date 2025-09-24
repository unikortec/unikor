// portal/api/rs-ie/lookup.js
// Tenta obter IE do RS a partir do CNPJ. Por padrão, retorna ISENTO se não conseguir.
// Se você tiver um proxy/integração oficial, configure RS_IE_API_URL e RS_IE_API_KEY no Vercel.

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
    const { cnpj } = req.body || {};
    const clean = String(cnpj||"").replace(/\D/g,"");
    if (!clean || clean.length < 14) {
      return res.status(400).json({ ok:false, error:"CNPJ inválido" });
    }

    const url = process.env.RS_IE_API_URL; // opcional: seu proxy para SEFAZ/RS
    const key = process.env.RS_IE_API_KEY; // opcional

    if (url) {
      try {
        const r = await fetch(url, {
          method:"POST",
          headers: { "Content-Type":"application/json", ...(key?{ "Authorization": `Bearer ${key}` }: {}) },
          body: JSON.stringify({ cnpj: clean })
        });
        if (r.ok) {
          const j = await r.json();
          // Esperado: { ok:true, ie:"123...", isento:false } – adapte conforme seu proxy
          return res.json({
            ok: true,
            ie: j.ie || null,
            isento: !!j.isento || !j.ie
          });
        }
      } catch(_) {}
    }

    // Fallback: sem integração, considerar ISENTO (manual)
    return res.json({ ok:true, ie: null, isento: true, source: "fallback" });
  } catch (e) {
    return res.status(500).json({ ok:false, error:e.message });
  }
}