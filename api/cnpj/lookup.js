// portal/api/cnpj/lookup.js
// Busca dados do CNPJ.
// 1) Tenta BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/{cnpj})
// 2) Fallback: raspa cnpj.biz/{cnpj} (melhor esforço; sujeito a mudanças de layout)
// Se UF for RS, tenta IE via /api/rs-ie/lookup.
//
// Retorna: { ok, cnpj, razao_social, nome_fantasia, cep, endereco, bairro, municipio, uf, ie?, fonte }

function onlyDigits(s){ return String(s||"").replace(/\D/g, ""); }

function buildEnderecoFromBrasilAPI(d){
  const log = d.logradouro || d.descricao_tipo_de_logradouro || "";
  const num = d.numero || "";
  const bai = d.bairro || "";
  const cid = d.municipio || d.nome_municipio || "";
  const uf  = d.uf || "";
  let end = [log, num].filter(Boolean).join(", ");
  if (bai) end = `${end} - ${bai}`;
  if (cid || uf) end = `${end}, ${cid}${uf?` - ${uf}`:""}`;
  return { endereco: end.trim(), bairro: bai || "", municipio: cid || "", uf: uf || "" };
}

async function tryBrasilAPI(cnpj){
  const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) return null;
  const j = await r.json();
  const { endereco, bairro, municipio, uf } = buildEnderecoFromBrasilAPI(j);
  const cep = onlyDigits(j.cep || "");
  return {
    ok: true,
    fonte: "brasilapi",
    cnpj,
    razao_social: j.razao_social || j.nome_fantasia || "",
    nome_fantasia: j.nome_fantasia || "",
    cep,
    endereco,
    bairro,
    municipio,
    uf
  };
}

async function tryCnpjBiz(cnpj){
  const url = `https://cnpj.biz/${cnpj}`;
  const r = await fetch(url, { headers: { "Accept": "text/html" } });
  if (!r.ok) return null;
  const html = await r.text();

  const reRazao = /Raz[aã]o Social:\s*<\/?[^>]*>\s*([^<\n]+)/i;
  const razao = html.match(reRazao)?.[1]?.trim() || "";

  const reFant = /Nome Fantasia:\s*<\/?[^>]*>\s*([^<\n]+)/i;
  const fantasia = html.match(reFant)?.[1]?.trim() || "";

  // tenta capturar bloco de endereço
  const reEndBloco = /Qual o endere[^?]+\?\s*<\/h[1-6]>[^]+?<\/section>/i;
  const bloco = html.match(reEndBloco)?.[0] || html;

  const reLinha = />([^<\n]+?)<\/(?:p|li|div)>/g;
  let m; const linhas = [];
  while ((m = reLinha.exec(bloco)) !== null) {
    const v = m[1].replace(/\s+/g,' ').trim();
    if (v && v.length < 120) linhas.push(v);
  }
  const cand = linhas.slice(0,6);

  let endereco = "", bairro = "", municipio = "", uf = "", cep = "";

  const cepHit = cand.find(x => /\b\d{5}-?\d{3}\b/.test(x));
  if (cepHit) cep = cepHit.match(/\b\d{5}-?\d{3}\b/)[0].replace('-','');

  const cidUfHit = cand.find(x => /\b[A-Z]{2}\b/.test(x) && /[A-Za-zÀ-ÿ]/.test(x));
  if (cidUfHit){
    const mm = cidUfHit.match(/(.+)\s+([A-Z]{2})\b/);
    if (mm){ municipio = mm[1].trim(); uf = mm[2]; }
  }

  const bairroHit = cand.find(x => x !== cepHit && x !== cidUfHit && !/\d{5}-?\d{3}/.test(x) && !/[A-Z]{2}\b/.test(x));
  if (bairroHit) bairro = bairroHit;

  const logHit = cand.find(x => /\d/.test(x)) || cand[0] || "";
  if (logHit) endereco = logHit;

  let endMont = endereco;
  if (bairro) endMont = `${endMont} - ${bairro}`;
  if (municipio || uf) endMont = `${endMont}, ${municipio}${uf?` - ${uf}`:""}`;

  return {
    ok: true,
    fonte: "cnpj.biz",
    cnpj,
    razao_social: razao || fantasia || "",
    nome_fantasia: fantasia || "",
    cep,
    endereco: endMont.trim(),
    bairro,
    municipio,
    uf
  };
}

export default async function handler(req, res){
  try{
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
    const raw = (req.body && (req.body.cnpj || req.body.CNPJ)) || "";
    const cnpj = onlyDigits(raw);
    if (cnpj.length !== 14) return res.status(400).json({ ok:false, error:"CNPJ inválido" });

    const b = await tryBrasilAPI(cnpj);
    if (b) {
      if (b.uf === "RS") {
        try {
          const rIE = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/rs-ie/lookup`, {
            method: "POST",
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify({ cnpj })
          });
          if (rIE.ok){
            const jIE = await rIE.json();
            if (jIE?.ok && (jIE.ie || jIE.isento)) b.ie = jIE.ie || (jIE.isento ? "ISENTO" : "");
          }
        } catch(_) {}
      }
      return res.json(b);
    }

    const c = await tryCnpjBiz(cnpj);
    if (c) {
      if (c.uf === "RS") {
        try {
          const rIE = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/rs-ie/lookup`, {
            method: "POST",
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify({ cnpj })
          });
          if (rIE.ok){
            const jIE = await rIE.json();
            if (jIE?.ok && (jIE.ie || jIE.isento)) c.ie = jIE.ie || (jIE.isento ? "ISENTO" : "");
          }
        } catch(_) {}
      }
      return res.json(c);
    }

    return res.status(404).json({ ok:false, error:"Não foi possível obter dados do CNPJ" });
  }catch(e){
    return res.status(500).json({ ok:false, error:e.message });
  }
}