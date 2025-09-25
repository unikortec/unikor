// portal/api/cnpj/lookup.js
// Coleta dados do https://cnpj.biz/{cnpj}. Se IE não aparecer na página, não define.
// Retorna: { ok, cnpj, razao_social, nome_fantasia, cep, endereco, bairro, municipio, uf, ie?, fonte:"cnpj.biz" }

function digits(s){ return String(s||"").replace(/\D/g,''); }

export default async function handler(req, res){
  try{
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });
    const cnpj = digits(req.body?.cnpj);
    if (cnpj.length !== 14) return res.status(400).json({ ok:false, error:'CNPJ inválido' });

    const url = `https://cnpj.biz/${cnpj}`;
    const r = await fetch(url, { headers:{ 'Accept':'text/html' } });
    if (!r.ok) return res.status(404).json({ ok:false, error:'Não encontrado no cnpj.biz' });
    const html = await r.text();

    const razao    = html.match(/Raz[aã]o Social:\s*<\/?[^>]*>\s*([^<\n]+)/i)?.[1]?.trim() || '';
    const fantasia = html.match(/Nome Fantasia:\s*<\/?[^>]*>\s*([^<\n]+)/i)?.[1]?.trim() || '';

    const reEndBloco = /Qual o endere[^?]+\?\s*<\/h[1-6]>[^]+?<\/section>/i;
    const bloco = html.match(reEndBloco)?.[0] || html;

    const reLinha = />([^<\n]+?)<\/(?:p|li|div)>/g;
    let m; const linhas = [];
    while ((m = reLinha.exec(bloco)) !== null) {
      const v = m[1].replace(/\s+/g,' ').trim();
      if (v && v.length < 140) linhas.push(v);
    }
    const cand = linhas.slice(0,8);

    let cep = '', municipio = '', uf = '', bairro = '', logradouro = '';

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
    if (logHit) logradouro = logHit;

    let endereco = logradouro;
    if (bairro) endereco = `${endereco} - ${bairro}`;
    if (municipio || uf) endereco = `${endereco}, ${municipio}${uf?` - ${uf}`:''}`;

    const ie = html.match(/Inscriç[aã]o Estadual:\s*<\/?[^>]*>\s*([^<\n]+)/i)?.[1]?.trim() || null;

    return res.json({
      ok: true,
      fonte: 'cnpj.biz',
      cnpj,
      razao_social: razao || fantasia || '',
      nome_fantasia: fantasia || '',
      cep,
      endereco: endereco.trim(),
      bairro, municipio, uf,
      ...(ie ? { ie } : {})
    });
  }catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}