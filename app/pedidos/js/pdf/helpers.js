// /app/pedidos/js/pdf/helpers.js
export function digitsOnly(v) { return String(v || "").replace(/\D/g, ""); }

export function formatarData(iso) {
  if (!iso) return "";
  const [a,m,d] = String(iso).split("-");
  return `${d}/${m}/${(a||"").slice(-2)}`;
}

export function diaDaSemanaExtenso(iso){
  if(!iso) return "";
  const d = new Date(iso+"T00:00:00");
  return d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase();
}

export function splitToWidth(doc, t, w){
  return doc.splitTextToSize(String(t || ""), w);
}

/* ======== Formatações BR (apresentação) ======== */
export function formatCNPJCPF(digits){
  const s = digitsOnly(digits);
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*$/, "$1.$2.$3-$4");
  return s;
}
export function formatTelefone(digits){
  const s = digitsOnly(digits);
  if (s.length === 11) return s.replace(/^(\d{2})(\d{5})(\d{4}).*$/, "($1) $2-$3");
  if (s.length === 10) return s.replace(/^(\d{2})(\d{4})(\d{4}).*$/, "($1) $2-$3");
  return s;
}
export function formatCEP(digits){
  const s = digitsOnly(digits);
  return (s.length === 8) ? s.replace(/^(\d{5})(\d{3}).*$/, "$1-$2") : s;
}

/* ======== Parsers numéricos robustos ======== */
function parseFlexible(str, scale){
  let s = String(str ?? "").trim();
  if (!s) return 0;
  s = s.replace(/\s/g, "").replace(/[^0-9.,-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  if (!isFinite(n)) return 0;
  return Math.round(n * scale);
}
export function strToCents(str){ return parseFlexible(str, 100); }
export function strToThousandths(str){ return parseFlexible(str, 1000); }

export function moneyBRfromCents(cents){
  const v = Math.round(cents);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const reais = Math.floor(abs / 100);
  const cent = String(abs % 100).padStart(2, "0");
  return `${sign}${reais.toLocaleString("pt-BR")},${cent}`;
}

/* ======== Nome de arquivo ======== */
/** Concatena até N primeiros nomes em CamelCase (padrão: 3). */
export function firstNamesCamel(client, n = 3){
  const tokens = String(client||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9\s]+/g,'')
    .trim().split(/\s+/).slice(0, n);

  const joined = tokens
    .map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join('')
    .replace(/[^A-Za-z0-9]/g,'');

  return joined || 'Cliente';
}

/** Agora usa até 3 primeiros nomes no prefixo. */
export function nomeArquivoPedido(cliente, entregaISO, horaEntrega) {
  const [ano,mes,dia] = String(entregaISO||'').split('-');
  const aa=(ano||'').slice(-2)||'AA';
  const hh=(horaEntrega||'').slice(0,2)||'HH';
  const mm=(horaEntrega||'').slice(3,5)||'MM';
  return `${firstNamesCamel(cliente, 3)}_${dia||'DD'}_${mes||'MM'}_${aa}_H${hh}-${mm}.pdf`;
}