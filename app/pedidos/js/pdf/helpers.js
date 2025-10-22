// helpers.js
export function digitsOnly(v) { return String(v || "").replace(/\D/g, ""); }
export function formatarData(iso) { if (!iso) return ""; const [a,m,d]=iso.split("-"); return `${d}/${m}/${a.slice(-2)}`; }
export function diaDaSemanaExtenso(iso){ if(!iso) return ""; const d=new Date(iso+"T00:00:00"); return d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase(); }
export function splitToWidth(doc, t, w){ return doc.splitTextToSize(String(t || ""), w); }

export function twoFirstNamesCamel(client){
  const tokens = String(client||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9\s]+/g,'')
    .trim().split(/\s+/).slice(0,2);
  return tokens.map(t=>t.charAt(0).toUpperCase()+t.slice(1).toLowerCase())
               .join('')
               .replace(/[^A-Za-z0-9]/g,'') || 'Cliente';
}
export function nomeArquivoPedido(cliente, entregaISO, horaEntrega) {
  const [ano,mes,dia] = String(entregaISO||'').split('-');
  const aa=(ano||'').slice(-2)||'AA';
  const hh=(horaEntrega||'').slice(0,2)||'HH';
  const mm=(horaEntrega||'').slice(3,5)||'MM';
  return `${twoFirstNamesCamel(cliente)}_${dia||'DD'}_${mes||'MM'}_${aa}_H${hh}-${mm}.pdf`;
}

/* Precisão decimal */
export function strToCents(str){
  const s = String(str ?? "").trim().replace(/\s+/g,"").replace(/\./g,"").replace(",",";");
  if (!s) return 0;
  return Math.round(Number(s.replace(";", ".")) * 100);
}
export function strToThousandths(str){
  const s = String(str ?? "").trim().replace(",",";");
  if (!s) return 0;
  return Math.round(Number(s.replace(";", ".")) * 1000);
}
export function moneyBRfromCents(cents){
  const v = Math.round(cents);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const reais = Math.floor(abs / 100);
  const cent = String(abs % 100).padStart(2, "0");
  return `${sign}${reais.toLocaleString("pt-BR")},${cent}`;
}
