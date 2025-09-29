const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));
const cheerio = require('cheerio');
const { parseStringPromise } = require('xml2js');

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

// ---------- helpers ----------
const allowCors = (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
};
const yyyymm = (d=new Date())=>{
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${d.getFullYear()}-${m}`;
};
const normalizeMoney = (s='')=>{
  const n = String(s).replace(/\./g,'').replace(',','.');
  const v = parseFloat(n); return isNaN(v) ? 0 : v;
};
async function saveToStorage(path, data, contentType){
  const file = bucket.file(path);
  await file.save(data, { contentType, resumable:false, public:true });
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(path)}`;
  return { path, publicUrl };
}
function parseNfceHtml(html){
  const $ = cheerio.load(html);

  const emitter = {
    name: ($('h3, .txtTopo, .razaoSocial').first().text() || '').trim() || undefined,
    cnpj: ($(':contains("CNPJ")').first().text().replace(/\D/g,'').slice(0,14)) || undefined,
    address: ($(':contains("Endere")').first().text() || '').replace(/\s+/g,' ').trim() || undefined
  };

  const dateMatch = html.match(/(\d{2}\/\d{2}\/\d{4})[^\d]{1,5}(\d{2}:\d{2}:\d{2})/);
  const dateStr = dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : undefined;

  const totalMatch = html.match(/VALOR\s*(?:TOTAL)?\s*\(R\$\)\s*[:\-]?\s*([\d\.,]+)/i) ||
                     html.match(/Total\s*R\$\s*([\d\.,]+)/i);
  const amount = totalMatch ? normalizeMoney(totalMatch[1]) : undefined;
  const payment = {
    method: ($(':contains("Forma de pagamento")').next().text() || '').trim() || undefined,
    amount
  };

  let items = [];
  $('table, .table').each((_, el)=>{
    const rows = $(el).find('tr');
    if (rows.length < 2) return;
    const head = $(rows[0]).text().toUpperCase();
    const isItems = (head.includes('DESCRI') || head.includes('PROD')) &&
                    (head.includes('QTD') || head.includes('QUANT')) &&
                    (head.includes('UNIT')) &&
                    (head.includes('TOTAL'));
    if (!isItems) return;

    for (let i=1;i<rows.length;i++){
      const tds = $(rows[i]).find('td,th'); if (tds.length < 4) continue;
      const txts = tds.map((__,td)=>$(td).text().trim()).get();
      const [descr, qtd, un, vUnit, vTot] = txts;
      if (!descr) continue;
      const qty = normalizeMoney(qtd);
      const unitPrice = normalizeMoney(vUnit);
      const lineTotal = normalizeMoney(vTot) || +(qty*unitPrice).toFixed(2);
      items.push({ code: undefined, description: descr, qty, unit: (un||'UN').replace(/\s+/g,''), unitPrice, lineTotal });
    }
  });

  if (items.length === 0){
    const rx = /(\d+[^\S\r\n]+)?([A-Z0-9 \-\/\.,]+?)\s+(\d+(?:[.,]\d+)?)\s+([A-Z]{1,4})\s+x\s+([\d\.,]+)\s+([\d\.,]+)/gi;
    let m; while((m = rx.exec(html)) !== null){
      items.push({
        code: m[1]?.trim()||undefined,
        description: m[2]?.trim(),
        qty: normalizeMoney(m[3]),
        unit: m[4],
        unitPrice: normalizeMoney(m[5]),
        lineTotal: normalizeMoney(m[6])
      });
    }
  }

  const totals = {
    items: items.reduce((s,it)=>s+(it.lineTotal||0),0),
    amount: amount ?? undefined
  };

  return { emitter, dateStr, payment, items, totals };
}

// ---------- NFC-e (65) via QR ----------
exports.ingestNfceByQr = functions.region('southamerica-east1').https.onRequest(async (req,res)=>{
  if (allowCors(req,res)) return;
  try{
    const { uid, category, qrUrl, accessKey } = req.body || {};
    if (!uid || !category || !qrUrl || !accessKey) return res.status(400).json({ error:'uid, category, qrUrl e accessKey são obrigatórios.' });

    const r = await fetch(qrUrl, { headers:{'User-Agent':'Mozilla/5.0'} });
    if (!r.ok) throw new Error(`Falha ao baixar QR: ${r.status}`);
    const html = await r.text();

    const parsed = parseNfceHtml(html);
    const yymm = yyyymm(new Date());
    const { path, publicUrl } = await saveToStorage(
      `despesas/${uid}/${yymm}/${category}/NOTA 65/${accessKey}.html`,
      html,
      'text/html; charset=utf-8'
    );

    const doc = {
      type: 'NFCe',
      model: 65,
      category,
      accessKey,
      emitter: parsed.emitter,
      payment: parsed.payment,
      date: parsed.dateStr || new Date().toISOString(),
      totals: parsed.totals,
      items: parsed.items,
      sources: { qrUrl, htmlPath: path, htmlUrl: publicUrl },
      created_by: uid,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    const ref = await db.collection('users').doc(uid).collection('expenses').add(doc);
    res.json({ ok:true, id: ref.id, docUrl: publicUrl, doc });
  }catch(e){
    console.error(e); res.status(500).json({ error:String(e.message||e) });
  }
});

// ---------- NFe (55) XML ----------
exports.ingestNfe55Xml = functions.region('southamerica-east1').https.onRequest(async (req,res)=>{
  if (allowCors(req,res)) return;
  try{
    const { uid, category, accessKey, xmlBase64 } = req.body || {};
    if (!uid || !category || !accessKey || !xmlBase64) return res.status(400).json({ error:'uid, category, accessKey e xmlBase64 são obrigatórios.' });

    const xml = Buffer.from(xmlBase64, 'base64').toString('utf8');
    const yymm = yyyymm(new Date());
    const { path, publicUrl } = await saveToStorage(
      `despesas/${uid}/${yymm}/${category}/NOTA 55/${accessKey}.xml`,
      xml,
      'application/xml'
    );

    const j = await parseStringPromise(xml, { explicitArray:false, ignoreAttrs:false });
    const nfe = j?.nfeProc?.NFe || j?.NFe || {};
    const inf = nfe?.infNFe || {};
    const emit = inf?.emit || {};
    const ide  = inf?.ide  || {};
    const pag  = inf?.pag  || {};

    const items = []
      .concat(inf?.det || [])
      .map(det=>{
        const p = det.prod || {};
        const vUn = parseFloat(p.vUnCom || 0);
        const q   = parseFloat(p.qCom || 0);
        return {
          code: p.cProd,
          description: p.xProd,
          qty: q,
          unit: p.uCom,
          unitPrice: vUn,
          lineTotal: parseFloat(p.vProd || (vUn*q) || 0)
        };
      });

    const totalValor = parseFloat(inf?.total?.ICMSTot?.vNF || items.reduce((s,i)=>s+i.lineTotal,0));
    const doc = {
      type: 'NFe55',
      model: 55,
      category,
      accessKey,
      emitter: { name: emit.xNome, cnpj: emit.CNPJ, address: `${emit.xLgr||''}, ${emit.nro||''}`.trim() },
      payment: { method: pag?.detPag?.tPag, amount: parseFloat(pag?.detPag?.vPag || totalValor) },
      date: `${ide.dhEmi || ide.dEmi || new Date().toISOString()}`,
      totals: { items: totalValor, amount: totalValor },
      items,
      sources: { xmlPath: path, xmlUrl: publicUrl },
      created_by: uid,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    const ref = await db.collection('users').doc(uid).collection('expenses').add(doc);
    res.json({ ok:true, id: ref.id, xmlUrl: publicUrl, doc });
  }catch(e){
    console.error(e); res.status(500).json({ error:String(e.message||e) });
  }
});