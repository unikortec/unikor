// relatorios/js/print.js
// Gera o mesmo PDF do app Pedidos para "reimprimir" um pedido salvo.

import { db, doc, getDoc, requireTenantContext } from './firebase.js';

// Pequena cópia local do montador do PDF (mesma lógica visual do app Pedidos):
// Para evitar dependência cruzada entre pastas, usamos um miolo mínimo.
const { jsPDF } = window.jspdf || {};

function moneyBR(n){
  return (Number(n||0)).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}
function toBR(iso){ if(!iso) return ""; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }

// ===== cálculo igual ao app =====
function kgPorUnFromDesc(desc=""){
  const s = String(desc).toLowerCase().replace(',', '.').replace(/\s+/g,' ');
  const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b\.?/g;
  let m, last=null; while((m=re.exec(s))!==null) last=m;
  if (!last) return 0;
  const raw = String(last[1]).replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'');
  const val = parseFloat(raw);
  if (!isFinite(val) || val<=0) return 0;
  const unit = last[2].toLowerCase();
  return (unit.startsWith('kg') || unit.startsWith('quilo')) ? val : (val/1000);
}
function subtotalItem(it){
  const qtd = Number(it.qtd ?? it.quantidade ?? 0);
  const un  = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
  const pu  = Number(it.precoUnit ?? it.preco ?? 0);
  if (typeof it.subtotal === "number") return Number(it.subtotal||0);
  if (un === "UN"){
    const kgUn = kgPorUnFromDesc(it.descricao || it.produto || "");
    return kgUn > 0 ? (qtd * kgUn) * pu : (qtd * pu);
  }
  return qtd * pu;
}

// Ticket 80mm (o mesmo “look” do app Pedidos)
function drawPedido80mm(p){
  if (!jsPDF) throw new Error('jsPDF não carregado');
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:[72,297] });

  const W = 68, X = 2;
  let y = 8;

  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.text('PEDIDO SERRA NOBRE', 36, y, {align:'center'});
  y += 3; doc.setLineWidth(.3); doc.line(2, y, 70, y); y += 4;

  const kv = (label, value)=> {
    doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.text(label, X+3, y);
    const w = doc.getTextWidth(label)+4;
    doc.setFont('helvetica','normal');
    doc.text(String(value||'-').toUpperCase(), X+3+w, y);
    y += 6;
  };

  kv('CLIENTE:', p.cliente);
  kv('ENDEREÇO:', p.endereco);
  kv('CONTATO:', p.contato || '');
  kv('CEP:', p.cep || '');

  // Data/hora
  doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text('DATA ENTREGA', X+W*0.25, y);
  doc.text('HORÁRIO ENTREGA', X+W*0.75, y, {align:'center'});
  y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text(toBR(p.dataEntregaISO||p.entregaISO||''), X+W*0.25, y);
  doc.text(String(p.horaEntrega||p.hora||''), X+W*0.75, y, {align:'center'});
  y += 7;

  // Itens
  doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text('ITENS', X+3, y); y+=4; doc.setFont('helvetica','normal'); doc.setFontSize(9);

  let subtotal = 0;
  (Array.isArray(p.itens)?p.itens:[]).forEach((it)=>{
    const desc = String(it.descricao || it.produto || '').toUpperCase();
    const qtd  = Number(it.qtd ?? it.quantidade ?? 0);
    const un   = (it.un || it.unidade || it.tipo || 'UN').toString().toUpperCase();
    const pu   = Number(it.precoUnit ?? it.preco ?? 0);
    const sub  = (typeof it.subtotal === 'number') ? Number(it.subtotal)
                  : subtotalItem(it);

    const line = `${desc}`;
    const tw = doc.splitTextToSize(line, W-6);
    tw.forEach((ln,i)=>doc.text(ln, X+3, y + i*4));
    y += Math.max(6, tw.length*4+2);

    doc.setFontSize(8);
    doc.text(`${qtd} ${un}  •  R$ ${pu.toFixed(2).replace('.',',')}  •  ${moneyBR(sub)}`, X+3, y);
    doc.setFontSize(9);
    y += 5;

    subtotal += sub;
  });

  y += 2;
  doc.setFont('helvetica','bold'); doc.setFontSize(9);
  doc.text('SOMA PRODUTOS:', X+3, y);
  doc.text(moneyBR(subtotal), X+W-3, y, {align:'right'});
  y += 6;

  // Entrega / Frete
  const tipo = (p?.entrega?.tipo || p.tipoEnt || 'ENTREGA').toUpperCase();
  const freteCobr = Number(
    p?.frete?.isento ? 0 : (p?.frete?.valorCobravel ?? p?.frete?.valorBase ?? p.freteValor ?? 0)
  );
  doc.setFont('helvetica','bold'); doc.setFontSize(9);
  doc.text(`TIPO: ${tipo}`, X+3, y); y += 5;
  doc.text('FRETE:', X+3, y);
  doc.text(freteCobr ? moneyBR(freteCobr) : 'ISENTO', X+W-3, y, {align:'right'});
  y += 6;

  // Total
  const total = subtotal + freteCobr;
  doc.text('TOTAL DO PEDIDO:', X+3, y);
  doc.text(moneyBR(total), X+W-3, y, {align:'right'});

  return doc;
}

export async function printPedido80mm(pedidoId){
  const { tenantId } = await requireTenantContext();
  const ref = doc(db, 'tenants', tenantId, 'pedidos', pedidoId);
  const snap = await getDoc(ref);
  if (!snap.exists()){ alert('Pedido não encontrado.'); return; }

  const data = snap.data();
  const pdf = drawPedido80mm({
    cliente: data.cliente || data.clienteUpper || '',
    endereco: data?.entrega?.endereco || data.endereco || '',
    dataEntregaISO: data.dataEntregaISO || '',
    horaEntrega: data.horaEntrega || '',
    contato: (data?.clienteFiscal?.contato || '').replace(/\D/g,''),
    cep: (data?.clienteFiscal?.cep || '').replace(/\D/g,''),
    itens: data.itens || [],
    frete: data.frete || {},
    freteValor: data.freteValor
  });

  pdf.save(`Pedido_${toBR(data.dataEntregaISO||'')}_${(data.cliente||'').replace(/\s+/g,'_')}.pdf`);
}