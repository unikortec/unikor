/** Converte a string para maiúsculas e remove espaços nas pontas. */
export const up = (s) => (s ?? "").toString().trim().toUpperCase();

/** Remove acentos de uma string. */
export const removeAcentos = (s) => (s ?? "").toString()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Normaliza um nome (maiúsculas, sem acentos). */
export const normNome = (s) => removeAcentos(up(s));

/** Retorna apenas os dígitos de uma string. */
export const digitsOnly = (v) => String(v||"").replace(/\D/g,"");

/**
 * Cria uma função "debounced", que atrasa a execução até que um certo tempo tenha passado sem ser chamada.
 * @param {Function} fn A função a ser executada.
 * @param {number} ms O tempo de espera em milissegundos.
 * @returns {Function} A nova função "debounced".
 */
export function debounce(fn, ms){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }

/** Força o valor de um elemento de input para maiúsculas. */
export function forcarUppercase(el){ if(!el || !el.value) return; el.value = up(el.value); }

/** Aplica máscara de CNPJ (XX.XXX.XXX/XXXX-XX) a um input. */
export function maskCNPJ(el){
  const d = digitsOnly(el.value).slice(0,14);
  let out = d;
  if (d.length>2) out = d.slice(0,2)+'.'+d.slice(2);
  if (d.length>5) out = out.slice(0,6)+'.'+d.slice(5);
  if (d.length>8) out = out.slice(0,10)+'/'+d.slice(8);
  if (d.length>12) out = out.slice(0,15)+'-'+d.slice(12);
  el.value = out;
}

/** Remove a máscara de CNPJ, deixando apenas os dígitos. */
export function normalizeCNPJ(el){ el.value = digitsOnly(el.value).slice(0,14); }

/** Aplica máscara de CEP (XXXXX-XXX) a um input. */
export function maskCEP(el){
  const d = digitsOnly(el.value).slice(0,8);
  el.value = d.length>5 ? d.slice(0,5)+'-'+d.slice(5) : d;
}

/** Remove a máscara de CEP, deixando apenas os dígitos. */
export function normalizeCEP(el){ el.value = digitsOnly(el.value).slice(0,8); }

/** Aplica máscara de Telefone ((XX) XXXXX-XXXX) a um input. */
export function maskTelefone(el){
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

/** Remove a máscara de Telefone, deixando apenas os dígitos. */
export function normalizeTelefone(el){ el.value = digitsOnly(el.value).slice(0,11); }

/** Formata uma string de dígitos como CNPJ. */
export function fmtCNPJ(d){ d = digitsOnly(d).slice(0,14);
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*$/, "$1.$2.$3/$4-$5"); }

/** Formata uma string de dígitos como CEP. */
export function fmtCEP(d){ d = digitsOnly(d).slice(0,8);
  return d.replace(/^(\d{5})(\d{3}).*$/, "$1-$2"); }

/** Formata uma string de dígitos como Telefone. */
export function fmtTel(d){ d = digitsOnly(d).slice(0,11);
  return (d.length<=10)
    ? d.replace(/^(\d{2})(\d{4})(\d{0,4}).*$/, "($1) $2-$3")
    : d.replace(/^(\d{2})(\d{5})(\d{0,4}).*$/, "($1) $2-$3"); }

/** Formata uma data ISO (YYYY-MM-DD) para DD/MM/AA. */
export function formatarData(iso){ if(!iso) return ""; const [a,m,d]=iso.split("-"); return `${d}/${m}/${a.slice(-2)}`; }

/** Retorna o dia da semana por extenso para uma data ISO. */
export function diaDaSemanaExtenso(iso){ if(!iso) return ""; const d=new Date(iso+"T00:00:00"); return d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase(); }

/** Quebra um texto em linhas de acordo com a largura para o jsPDF. */
export function splitToWidth(doc,t,w){ return doc.splitTextToSize(t||"", w); }

/** Garante que o endereço termine com ", Porto Alegre - RS" se não houver outra cidade. */
export function appendPOA(str){
  const t = String(str||"").trim();
  if (!t) return t;
  if (/porto\s*alegre/i.test(t)) return t;
  const TEM_CIDADE = /,\s([A-Za-zÀ-ÿ'.\-\s]{2,})(?:\s-\s[A-Za-z]{2})?(?:\s,\sBrasil)?\s$/i;
  if (TEM_CIDADE.test(t)) return t;
  return `${t}, Porto Alegre - RS`;
}

/**
 * Extrai o valor do peso (em KG) do nome de um produto.
 * Ex: "COSTELA 1.2KG" -> 1.2 | "FRANGO 700G" -> 0.7
 * @param {string} nome O nome do produto.
 * @returns {number|null} O peso em KG, ou null se não for encontrado.
 */
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
  
  // Converte gramas para kg
  return val / 1000;
}
