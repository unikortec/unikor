// portal/api/cnpj/lookup.js
// Busca dados do CNPJ.
// 1) Tenta BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/{cnpj})
// 2) Fallback: raspa cnpj.biz/{cnpj} (melhor esforço; sujeito a mudanças de layout)
// Se UF for RS, tenta IE via /portal/api/rs-ie/lookup.
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

function withTimeout(promise, ms = 7000){
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
  });
}

function getBaseURL(req){
  // monta URL absoluta do próprio deployment (útil para chamar /portal/api/rs-ie/lookup)
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host  = req.headers.host;
  return `${proto}://${host}`;
}

async function tryBrasilAPI(cnpj){
  const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
  const r = await withTimeout(fetch(url, { headers: { "Accept": "application/json" } }), 7000);
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
  const r = await withTimeout(fetch(url, {
    headers: {
      "Accept": "text/html",
      // ajuda a evitar bloqueios simples
      "User-Agent": "Mozilla/5.0 (compatible; UnikorBot/1.0; +https://app.unikor.com.br)"
    }
  }), 8000);
  if (!r.ok) return null;
  const html = await r.text();

  const reRazao = /Raz[aã]o Social:\s*<\/?[^>]*>\s*([^<\n]+)/i;
  const razao = html.match(reRazao)?.[1]?.trim() || "";

  const reFant = /Nome Fantasia:\s*<\/?[^>]*>\s*([^<\n]+)/i;
  const fantasia = html.match(reFant)?.[1]?.trim() || "";

  // tenta capturar bloco de endereço
  const reEndBloco = /Qual o endere[^?]+\?\s*<\/h[1-6]>[^]+?<\/section>/i;
  const bloco = html.match(reEndBloco)?.[0] || html;

  // linhas curtas úteis
  const reLinha = />([^<\n]+?)<\/(?:p|li|div)>/g;
  let m; const linhas = [];
  while ((m = reLinha.exec(bloco)) !== null) {
    const v = m[1].replace(/\s+/g,' ').trim();
    if (v && v.length < 140) linhas.push(v);
  }
  const cand = linhas.slice(0,12);

  let endereco = "", bairro = "", municipio = "", uf = "", cep = "";

  const cepHit = cand.find(x => /\b\d{5}-?\d{3}\b/.test(x));
  if (cepHit) cep = cepHit.match(/\b\d{5}-?\d{3}\b/)[0].replace('-','');

  const cidUfHit = cand.find(x => /\b[A-Z]{2}\b/.test(x) && /[A-Za-zÀ-ÿ]/.test(x));
  if (cidUfHit){
    const mm = cidUfHit.match(/(.+)\s+([A-Z]{2})\b/);
    if (mm){ municipio = mm[1].trim(); uf = mm[2]; }
  }

  // tenta bairro como linha que não seja cep/ciduf e sem muito número
  const bairroHit = cand.find(x =>
    x !== cepHit &&
    x !== cidUfHit &&
    !/\d{5}-?\d{3}/.test(x) &&
    !/[A-Z]{2}\b/.test(x) &&
    !/^\d+$/.test(x) &&
    x.length <= 60
  );
  if (bairroHit) bairro = bairroHit;

  // logradouro (linha com número costuma ser a primeira ou alguma com dígitos)
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

async function lookupIE_RS_ifNeeded(req, cnpj, uf){
  if (uf !== "RS") return null;
  try{
    const base = getBaseURL(req);
    const rIE = await withTimeout(fetch(`${base}/portal/api/rs-ie/lookup`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ cnpj })
    }), 7000);
    if (!rIE.ok) return null;
    const jIE = await rIE.json();
    if (jIE?.ok) return jIE.ie || (jIE.isento ? "ISENTO" : null);
  }catch(_){}
  return null;
}

function allowCORS(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res){
  allowCORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try{
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

    const raw = (req.body && (req.body.cnpj || req.body.CNPJ)) || "";
    const cnpj = onlyDigits(raw);
    if (cnpj.length !== 14) return res.status(400).json({ ok:false, error:"CNPJ inválido" });

    // 1) BrasilAPI
    try{
      const b = await tryBrasilAPI(cnpj);
      if (b) {
        const ie = await lookupIE_RS_ifNeeded(req, cnpj, b.uf);
        if (ie) b.ie = ie;
        return res.json(b);
      }
    }catch(_){ /* segue para fallback */ }

    // 2) cnpj.biz (fallback)
    try{
      const c = await tryCnpjBiz(cnpj);
      if (c) {
        const ie = await lookupIE_RS_ifNeeded(req, cnpj, c.uf);
        if (ie) c.ie = ie;
        return res.json(c);
      }
    }catch(_){}

    return res.status(404).json({ ok:false, error:"Não foi possível obter dados do CNPJ" });
  }catch(e){
    return res.status(500).json({ ok:false, error:e.message || String(e) });
  }
}