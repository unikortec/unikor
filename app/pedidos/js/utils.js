export const up = (s) => (s ?? "").toString().trim().toUpperCase();
export const removeAcentos = (s) => (s ?? "").toString()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const normNome = (s) => removeAcentos(up(s));
export const digitsOnly = (v) => String(v||"").replace(/\D/g,"");


export function debounce(fn, ms){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }


export function forcarUppercase(el){ if(!el || !el.value) return; el.value = up(el.value); }
export function maskCNPJ(el){
  const d = digitsOnly(el.value).slice(0,14);
  let out = d;
  if (d.length>2) out = d.slice(0,2)+'.'+d.slice(2);
  if (d.length>5) out = out.slice(0,6)+'.'+d.slice(5);
  if (d.length>8) out = out.slice(0,10)+'/'+d.slice(8);
  if (d.length>12) out = out.slice(0,15)+'-'+d.slice(12);
  el.value = out;
}
export function normalizeCNPJ(el){ el.value = digitsOnly(el.value).slice(0,14); }
export function maskCEP(el){
  const d = digitsOnly(el.value).slice(0,8);
  el.value = d.length>5 ? d.slice(0,5)+'-'+d.slice(5) : d;
}
export function normalizeCEP(el){ el.value = digitsOnly(el.value).slice(0,8); }
export function maskTelefone(el){ // Correção: reescrita da função para evitar erro de template literal
  const d = digitsOnly(el.value).slice(0,11);
  let formatted = '';
  if (d.length <= 2) {
    formatted = d;
  } else if (d.length <= 6) {
    formatted = `(${d.slice(0,2)}) ${d.slice(2)}`;
  } else if (d.length <= 10) { // Telefone fixo ou celular sem 9º dígito
    formatted = `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  } else { // Celular com 9º dígito
    formatted = `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
  }
  el.value = formatted;
}
export function normalizeTelefone(el){ el.value = digitsOnly(el.value).slice(0,11); }


export function fmtCNPJ(d){ d = digitsOnly(d).slice(0,14);
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*$/, "$1.$2.$3/$4-$5"); }
export function fmtCEP(d){ d = digitsOnly(d).slice(0,8);
  return d.replace(/^(\d{5})(\d{3}).*$/, "$1-$2"); }
export function fmtTel(d){ d = digitsOnly(d).slice(0,11);
  return (d.length<=10)
    ? d.replace(/^(\d{2})(\d{4})(\d{0,4}).*$/, "($1) $2-$3")
    : d.replace(/^(\d{2})(\d{5})(\d{0,4}).*$/, "($1) $2-$3"); }


export function formatarData(iso){ if(!iso) return ""; const [a,m,d]=iso.split("-"); return `${d}/${m}/${a.slice(-2)}`; } // Correção: template literal
export function diaDaSemanaExtenso(iso){ if(!iso) return ""; const d=new Date(iso+"T00:00:00"); return d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase(); }
export function splitToWidth(doc,t,w){ return doc.splitTextToSize(t||"", w); }


// Endereço → garante POA quando não houver cidade
export function appendPOA(str){
  const t = String(str||"").trim();
  if (!t) return t;
  if (/porto\s*alegre/i.test(t)) return t;
  const TEM_CIDADE = /,\s([A-Za-zÀ-ÿ'.\-\s]{2,})(?:\s-\s[A-Za-z]{2})?(?:\s,\sBrasil)?\s$/i;
  if (TEM_CIDADE.test(t)) return t;
  return `${t}, Porto Alegre - RS`; // Correção: template literal
}


// Peso no nome do produto (ex.: "COSTELA 1.2KG")
// utils.js
export function parsePesoFromProduto(nome){
  // Normaliza vírgula -> ponto e remove pontuação supérflua
  const s = String(nome || "")
    .toLowerCase()
    .replace(',', '.')
    .replace(/\s+/g, ' ')
    .trim();

  // Captura o ÚLTIMO peso informado no nome (ex.: "ALCATRA 700G CX 10x700G" -> considera 700g)
  // Suporta: "1.2kg", "1,2 kg", "1 kg", "1kg.", "1 kgs", "(1,200 kg)", "1200g", "1.200 g", "100 gr", "100 gramas"
  const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b\.?/g;

  let m, last = null;
  while ((m = re.exec(s)) !== null) last = m;
  if (!last) return null;

  // Número com milhares tipo "1.200" vira "1200"
  const raw = String(last[1]).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '');
  const val = parseFloat(raw);
  if (!isFinite(val) || val <= 0) return null;

  const unit = last[2];
  if (unit === 'kg' || unit === 'kgs' || unit === 'kg.' || unit.startsWith('quilo')) return val;
  // gramas → kg
  return val / 1000;
}
