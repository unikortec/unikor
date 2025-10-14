// /app/despesas/js/ocr.js
// OCR robusto: Tesseract worker singleton + pré-processamento + heurísticas PT-BR

let tesseractLoaded = false;
let workerPromise = null;

/** Carrega script do Tesseract (uma vez) */
async function ensureTesseract(){
  if (tesseractLoaded) return;
  await new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  tesseractLoaded = true;
}

/** Retorna um worker reutilizável (singleton) já inicializado em por+eng */
async function getWorker(){
  await ensureTesseract();
  if (workerPromise) return workerPromise;

  workerPromise = (async ()=>{
    const worker = await Tesseract.createWorker({
      // logger: (m)=>console.debug('[OCR]', m) // descomente para debug
    });
    await worker.load();
    await worker.loadLanguage('por+eng');
    await worker.initialize('por+eng');
    // Parâmetros bons para recibos/notas
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK, // PSM 6
      preserve_interword_spaces: '1',
      // whitelist ajuda a evitar ruído, mantendo letras acentuadas comuns
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÂÊÔÃÕÇabcdefghijklmnopqrstuvwxyzáéíóúâêôãõç0123456789-./,: R$'
    });
    return worker;
  })();

  return workerPromise;
}

/* ============ Pré-processamento da imagem (opcional redundante com app.js) ============ */
/** Converte Blob/File em DataURL */
function blobToDataURL(blob){
  return new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/** Downscale + grayscale + leve threshold para melhorar OCR */
async function preprocessImage(fileOrBlob, maxSide = 1800){
  try{
    const dataUrl = await blobToDataURL(fileOrBlob);
    const img = new Image();
    await new Promise((res, rej)=>{ img.onload = res; img.onerror = rej; img.src = dataUrl; });

    // Redimensiona mantendo proporção
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Desenha
    ctx.drawImage(img, 0, 0, w, h);

    // Converte para grayscale e aplica um threshold simples (binarização leve)
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    // cálculo de luminância + auto limiar por média
    let sum = 0;
    for (let i=0;i<d.length;i+=4){
      const Y = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
      sum += Y;
    }
    const mean = sum / (d.length/4);
    const T = Math.max(110, Math.min(200, mean)); // clamp do threshold

    for (let i=0;i<d.length;i+=4){
      const Y = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
      const v = (Y > T ? 255 : 0);
      d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
    }
    ctx.putImageData(imgData, 0, 0);

    return await new Promise(res => canvas.toBlob(b => res(b), 'image/png', 0.92));
  }catch(e){
    // Se falhar por qualquer motivo, retorna o original
    return fileOrBlob;
  }
}

/* ============ Parsing heurístico do texto OCR ============ */

function normalizeCurrency(str){
  // aceita "1.234,56" ou "1234,56" ou "1,234.56" e normaliza para float
  if (!str) return 0;
  // primeiro, se tem vírgula seguida de 2 dígitos, assume formato BR
  if (/,(\d{2})\b/.test(str)) {
    return parseFloat(str.replace(/\./g,'').replace(',', '.')) || 0;
  }
  // caso contrário, tenta padrão US
  const s = str.replace(/,/g, '');
  return parseFloat(s) || 0;
}

function extractEstabelecimento(lines){
  // 1) Procura linha ANTES do CNPJ que seja predominantemente texto (nome fantasia/razão)
  const cnpjIdx = lines.findIndex(l => /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/.test(l) || /\bCNPJ\b/i.test(l));
  if (cnpjIdx > 0) {
    for (let i = Math.max(0, cnpjIdx-2); i >= Math.max(0, cnpjIdx-4); i--){
      const s = (lines[i]||'').trim();
      if (s && /[A-Za-zÁÉÍÓÚÂÊÔÃÕÇ]/.test(s) && s.length >= 3) return s;
    }
  }
  // 2) Primeira linha em CAPS razoável
  const caps = lines.find(l => /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\-\s\.\&\/]{4,}$/.test(l));
  if (caps) return caps;
  // 3) Fallback: primeira linha não-vazia
  return lines.find(Boolean) || '';
}

function parseLinesToExpense(text){
  const rawLines = text.split(/\r?\n/).map(s=>s.replace(/[^\S\r\n]+/g,' ').trim());
  // remove linhas vazias e ruído simples
  const lines = rawLines.filter(Boolean);

  const currency = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}|\d+,\d{2})/;
  const totalRe  = /(total(?:\s+geral)?|valor\s*total|total a pagar|importe total|total\s*R\$?|valor a pagar)/i;

  let estabelecimento = extractEstabelecimento(lines);
  let total = 0;
  let data = null;
  const itens = [];

  // Data dd/mm/aaaa | dd/mm/aa | dd-mm-aaaa
  for (const s of lines){
    const m = s.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
    if (m){
      const [ , d, mth, y ] = m;
      const yyyy = (y.length===2 ? ('20'+y) : y).padStart(4,'0');
      data = `${yyyy}-${mth.padStart(2,'0')}-${d.padStart(2,'0')}`;
      break;
    }
  }

  // Total (primeiro match confiável)
  for (const s of lines){
    if (totalRe.test(s) && currency.test(s)){
      const c = s.match(currency)?.[0] || '0,00';
      total = normalizeCurrency(c);
      break;
    }
  }

  // Itens — alguns formatos comuns:
  // 1) "DESCRICAO ........ 9,99"
  // 2) "QTD x UNIT = 9,99" (vamos registrar como um item com nome agregado)
  // 3) "DESCRICAO QTD UN PRECO 9,99" (reserva: pega preço final ao fim da linha)
  for (const s of lines){
    // padrão (descrição + preço no fim)
    let m = s.match(new RegExp(`^(.+?)\\s+${currency.source}$`));
    if (m){
      const nome = m[1].replace(/\s{2,}/g,' ').trim();
      const val  = normalizeCurrency(m[m.length-1]);
      if (nome && val>0) { itens.push({ nome, valor: val }); continue; }
    }
    // padrão "x" (ex.: "2 x 4,50 = 9,00" ou "2x4,50 9,00")
    m = s.match(new RegExp(`(.+?)(\\d+)\\s*x\\s*${currency.source}[^\\d]*${currency.source}$`, 'i'));
    if (m){
      const nome = m[1].replace(/\s{2,}/g,' ').trim();
      const totalLinha = normalizeCurrency(m[m.length-1]);
      if (nome && totalLinha>0) { itens.push({ nome, valor: totalLinha }); continue; }
    }
  }

  // se não encontrou total explícito, usa soma dos itens
  if (!total && itens.length) {
    total = itens.reduce((s,i)=>s + (Number(i.valor)||0), 0);
  }

  return {
    estabelecimento,
    data: data || new Date().toISOString().slice(0,10),
    itens,
    total
  };
}

/* ============ API ============ */

/**
 * Executa OCR na imagem e retorna { estabelecimento, data, itens[], total }
 * - Usa worker singleton (rápido após a 1ª execução)
 * - Pré-processa a imagem para melhorar acurácia
 */
export async function ocrImageToExpense(fileOrBlob){
  const worker = await getWorker();
  const pre = await preprocessImage(fileOrBlob); // seguro: se falhar, volta original
  const { data } = await worker.recognize(pre);
  const text = data?.text || '';
  return parseLinesToExpense(text);
}

/** Opcional: encerrar worker (se quiser liberar memória ao sair da página) */
export async function disposeOcrWorker(){
  if (!workerPromise) return;
  try{
    const worker = await workerPromise;
    await worker.terminate();
  }catch{}
  workerPromise = null;
}