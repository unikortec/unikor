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
export function maskTelefone(el){
  const d = digitsOnly(el.value).slice(0,11);
  if (d.length<=10){
    el.value = d.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*$/, (_,a,b,c)=> (a?`(${a}`:'')+(a&&a.length===2?`) `:'')+(b||'')+(c?'-'+c:'')); 
  } else {
    el.value = d.replace(/^(\d{2})(\d{5})(\d{0,4}).*$/, "($1) $2-$3");
  }
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

export function formatarData(iso){ if(!iso) return ""; const [a,m,d]=iso.split("-"); return `${d}/${m}/${a.slice(-2)}`; }
export function diaDaSemanaExtenso(iso){ if(!iso) return ""; const d=new Date(iso+"T00:00:00"); return d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase(); }
export function splitToWidth(doc,t,w){ return doc.splitTextToSize(t||"", w); }

// Endereço → garante POA quando não houver cidade
export function appendPOA(str){
  const t = String(str||"").trim();
  if (!t) return t;
  if (/porto\s*alegre/i.test(t)) return t;
  const TEM_CIDADE = /,\s*([A-Za-zÀ-ÿ'.\-\s]{2,})(?:\s*-\s*[A-Za-z]{2})?(?:\s*,\s*Brasil)?\s*$/i;
  if (TEM_CIDADE.test(t)) return t;
  return `${t}, Porto Alegre - RS`;
}

// Peso no nome do produto (ex.: "COSTELA 1.2KG")
export function parsePesoFromProduto(nome){
  const s = String(nome||"").toLowerCase().replace(',', '.');
  const re = /(\d+(?:\.\d+)?)[\s]*(kg|quilo|quilos|g|gr|grama|gramas)\b/g;
  let m, last=null;
  while ((m = re.exec(s)) !== null) last = m;
  if(!last) return null;
  const val = parseFloat(last[1]);
  const unit = last[2];
  if(!isFinite(val) || val<=0) return null;
  if (unit === 'kg' || unit.startsWith('quilo')) return val;
  return val / 1000;
}