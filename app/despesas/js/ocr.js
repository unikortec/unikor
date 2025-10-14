// /app/despesas/js/ocr.js
let tesseractReady = false;

async function ensureTesseract(){
  if (tesseractReady) return;
  await new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  tesseractReady = true;
}

function parseLinesToExpense(text){
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);

  const currency = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/;
  const totalRe  = /(total(?:\s+geral)?|valor\s*total|total a pagar|importe total)/i;

  let estabelecimento = lines[0] || '';
  let total = 0;
  let data = null;
  const itens = [];

  // Data dd/mm/aaaa ou dd/mm/aa
  for (const s of lines){
    const m = s.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
    if (m){ const [ , d, mth, y ] = m; const yyyy = y.length===2 ? ('20'+y) : y; data = `${yyyy}-${mth.padStart(2,'0')}-${d.padStart(2,'0')}`; break; }
  }

  // Total
  for (const s of lines){
    if (totalRe.test(s) && currency.test(s)){
      const c = s.match(currency)?.[0] || '0,00';
      total = parseFloat(c.replace(/\./g,'').replace(',', '.')) || 0;
      break;
    }
  }

  // Itens (descrição + preço no fim)
  for (const s of lines){
    const m = s.match(new RegExp(`(.+?)\\s+${currency.source}$`));
    if (m){
      const nome = m[1].replace(/\s{2,}/g,' ').trim();
      const val = parseFloat(m[m.length-1].replace(/\./g,'').replace(',', '.')) || 0;
      if (val>0) itens.push({ nome, valor: val });
    }
  }

  return {
    estabelecimento,
    data: data || new Date().toISOString().slice(0,10),
    itens,
    total: total || itens.reduce((s,i)=>s+i.valor,0)
  };
}

export async function ocrImageToExpense(fileOrBlob){
  await ensureTesseract();
  const { data } = await Tesseract.recognize(fileOrBlob, 'por', { logger:()=>{} });
  return parseLinesToExpense(data.text || '');
}