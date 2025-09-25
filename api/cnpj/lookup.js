// portal/api/cnpj/lookup.js
// Busca dados do CNPJ exclusivamente via cnpj.biz.
// Retorna: { ok, fonte:"cnpj.biz", cnpj, razao_social, nome_fantasia, cep, endereco, bairro, municipio, uf, ie }

function onlyDigits(s){ return String(s||"").replace(/\D/g, ""); }

async function tryCnpjBiz(cnpj){
  const url = `https://cnpj.biz/${cnpj}`;
  const r = await fetch(url, { headers: { "Accept": "text/html" } });
  if (!r.ok) return null;
  const html = await r.text();

  // Razão / Fantasia
  const reRazao = /Raz[aã]o Social:\s*<\/?[^>]*>\s*([^<\n]+)/i;
  const razao = html.match(reRazao)?.[1]?.trim() || "";
  const reFant = /Nome Fantasia:\s*<\/?[^>]*>\s*([^<\n]+)/i;
  const fantasia = html.match(reFant)?.[1]?.trim() || "";

  // Inscrição Estadual
  let ie = null;
  const reIEs = [
    /Inscri[çc][\w\s]*Estadual[:\s]*<\/?[^>]*>\s*([^<\n]+)/i,
    /Inscri[çc][\w\s]*Estadual[:\s]*([^<\n]+)/i,
    /IE[:\s]*<\/?[^>]*>\s*([^<\n]+)/i,
    /Inscri[^<]*estadual[^:]*:\s*([^<\n]+)/i
  ];
  for (const rx of reIEs){
    const m = html.match(rx);
    if (m && m[1]) {
      ie = m[1].trim().replace(/\s+/g,' ').toUpperCase();
      break;
    }
  }
  if (!ie || /ISENTO/i.test(ie)) ie = "ISENTO";

  // Endereço (melhor esforço)
  const reEndBloco = /Qual o endere[^?]+\?\s*<\/h[1-6]>[^]+?<\/section>/i;
  const bloco = html.match(reEndBloco)?.[0] || html;

  const reLinha = />([^<\n]+?)<\/(?:p|li|div|span|td|strong|b)>/g;
  let m; const linhas = [];
  while ((m = reLinha.exec(bloco)) !== null) {
    const v = m[1].replace(/\s+/g,' ').trim();
    if (v && v.length < 140) linhas.push(v);
  }
  const cand = linhas.slice(0, 8);

  let endereco = "", bairro = "", municipio = "", uf = "", cep = "";

  const cepHit = cand.find(x => /\b\d{5}-?\d{3}\b/.test(x));
  if (cepHit) cep = cepHit.match(/\b\d{5}-?\d{3}\b/)[0].replace('-','');

  const cidUfHit = cand.find(x => /[A-Za-zÀ-ÿ].+\s+[A-Z]{2}\b/.test(x));
  if (cidUfHit){
    const mm = cidUfHit.match(/(.+)\s+([A-Z]{2})\b/);
    if (mm){ municipio = mm[1].trim(); uf = mm[2]; }
  }

  const bairroHit = cand.find(x => x !== cepHit && x !== cidUfHit && !/\d{5}-?\d{3}/.test(x) && !/[A-Z]{2}\b/.test(x));
  if (bairroHit) bairro = bairroHit;

  const logHit = cand.find(x => /\d/.test(x)) || cand[0] || "";
  if (logHit) endereco = logHit;

  let endMont = endereco;
  if (bairro && !endMont.includes(bairro)) endMont = `${endMont} - ${bairro}`;
  if ((municipio || uf) && !endMont.includes(municipio)) endMont = `${endMont}, ${municipio}${uf?` - ${uf}`:""}`;
  endMont = (endMont || "").trim();

  return {
    ok: true,
    fonte: "cnpj.biz",
    cnpj,
    razao_social: (razao || fantasia || "").trim(),
    nome_fantasia: (fantasia || "").trim(),
    cep: cep || "",
    endereco: endMont,
    bairro: bairro || "",
    municipio: municipio || "",
    uf: uf || "",
    ie
  };
}

export default async function handler(req, res){
  try{
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
    const raw = (req.body && (req.body.cnpj || req.body.CNPJ)) || "";
    const cnpj = onlyDigits(raw);
    if (cnpj.length !== 14) return res.status(400).json({ ok:false, error:"CNPJ inválido" });

    const c = await tryCnpjBiz(cnpj);
    if (c) return res.json(c);

    return res.status(404).json({ ok:false, error:"Não foi possível obter dados no cnpj.biz", cnpj });
  }catch(e){
    return res.status(500).json({ ok:false, error:e.message });
  }
}