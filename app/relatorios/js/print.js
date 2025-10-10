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

// === SUBSTITUA SOMENTE ESTA FUNÇÃO NO relatorios/js/print.js ===
function drawPedido80mm(p){
  if (!jsPDF) throw new Error('jsPDF não carregado');
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:[72, 297] });

  // ---------- helpers compatíveis com o pdf do app Pedidos ----------
  const margemX = 2, larguraCaixa = 68, SAFE_BOTTOM = 280;
  let y = 10;

  const splitToWidth = (t, w)=> doc.splitTextToSize(t||"", w);
  const formatarData = (iso)=> { if(!iso) return ""; const [a,m,d]=iso.split("-"); return `${d}/${m}/${a.slice(-2)}`; };
  const diaDaSemanaExtenso = (iso)=> { if(!iso) return ""; const d=new Date(iso+"T00:00:00"); return d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase(); };

  const ensureSpace = (h)=>{ if (y+h > SAFE_BOTTOM){ doc.addPage([72,297],'portrait'); y = 10; } };

  function drawCenteredKeyValueBox(x,y0,w,label,value,{rowH=10,titleSize=7,valueSize=8}={}){
    doc.setDrawColor(0); doc.setLineWidth(0.2); doc.rect(x,y0,w,rowH,"S");
    const cy = y0 + rowH/2 + .5;
    doc.setFont("helvetica","bold"); doc.setFontSize(titleSize);
    doc.text(String(label||"").toUpperCase(), x+w/2, cy-3, {align:"center"});
    doc.setFont("helvetica","normal"); doc.setFontSize(valueSize);
    doc.text(String(value||"").toUpperCase(), x+w/2, cy+2, {align:"center"});
    return rowH;
  }
  function drawKeyValueBox(x,y0,w,label,value,{rowH=10,titleSize=7,valueSize=8}={}){
    doc.setDrawColor(0); doc.setLineWidth(0.2); doc.rect(x,y0,w,rowH,"S");
    const cy = y0 + rowH/2 + .5;
    const ltxt = (String(label||"").toUpperCase()+": ");
    doc.setFont("helvetica","bold"); doc.setFontSize(titleSize);
    doc.text(ltxt, x+3, cy);
    doc.setFont("helvetica","normal"); doc.setFontSize(valueSize);
    doc.text(String(value||"").toUpperCase(), x+3 + doc.getTextWidth(ltxt), cy);
    return rowH;
  }

  // ---------- Cabeçalho ----------
  doc.setFont("helvetica","bold"); doc.setFontSize(11);
  doc.text("PEDIDO SERRA NOBRE", 36, 7, { align:"center" });
  doc.setLineWidth(0.3); doc.line(2,9,70,9);

  // Normalização leve de campos (o relatório não tem CNPJ/IE; deixamos “—”)
  const dataEntregaISO = p.dataEntregaISO || p.entregaISO || "";
  const horaEntrega    = p.horaEntrega || p.hora || "";
  const pagamento      = (p.pagamento || "").toUpperCase();

  // ---------- Cliente ----------
  ensureSpace(14);
  y += drawKeyValueBox(margemX, y, larguraCaixa, "CLIENTE", (p.cliente||"").toUpperCase(), {rowH:12}) + 1;

  // CNPJ / IE (placeholders)
  const gap1=1, halfW=(larguraCaixa-gap1)/2;
  ensureSpace(10);
  drawCenteredKeyValueBox(margemX, y, halfW, "CNPJ", "—");
  drawCenteredKeyValueBox(margemX+halfW+gap1, y, halfW, "I.E.", "—");
  y += 11;

  // ---------- Endereço ----------
  const pad=3, innerW=larguraCaixa - pad*2;
  const linhasEnd = splitToWidth((p.endereco||"").toUpperCase(), innerW);
  const rowH = Math.max(12, 6 + linhasEnd.length*5 + 4);
  ensureSpace(rowH);
  doc.setDrawColor(0); doc.setLineWidth(0.2); doc.rect(margemX,y,larguraCaixa,rowH,"S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.text("ENDEREÇO", margemX+pad, y+5);
  doc.setFont("helvetica","normal"); doc.setFontSize(8);
  let baseY = y+9; linhasEnd.forEach((ln,i)=> doc.text(ln, margemX+pad, baseY+i*5));
  y += rowH + 1;

  // ---------- Contato / CEP (se vierem vazios mostra “—”) ----------
  ensureSpace(10);
  drawCenteredKeyValueBox(margemX, y, halfW, "CONTATO", (p.contato||"").toString()||"—");
  drawCenteredKeyValueBox(margemX+halfW+gap1, y, halfW, "CEP", (p.cep||"").toString()||"—");
  y += 11;

  // ---------- Dia / Data / Hora ----------
  ensureSpace(22);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("DIA DA SEMANA:", margemX+3, y+6);
  doc.text(diaDaSemanaExtenso(dataEntregaISO), margemX+larguraCaixa/2+12, y+6, {align:"center"});
  y += 11;

  const halfW2 = (larguraCaixa-1)/2;
  doc.setFont("helvetica","bold"); doc.setFontSize(7);
  doc.rect(margemX, y, halfW2, 10, "S");
  doc.rect(margemX+halfW2+1, y, halfW2, 10, "S");
  doc.text("DATA ENTREGA", margemX+halfW2/2, y+4, {align:"center"});
  doc.text("HORÁRIO ENTREGA", margemX+halfW2+1+halfW2/2, y+4, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(formatarData(dataEntregaISO), margemX+halfW2/2, y+8, {align:"center"});
  doc.text(horaEntrega || "—", margemX+halfW2+1+halfW2/2, y+8, {align:"center"});
  y += 12;

  // ---------- Forma de pagamento ----------
  ensureSpace(10);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8);
  doc.text("FORMA DE PAGAMENTO", margemX+3, y+6);
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(pagamento || "—", margemX+larguraCaixa-3, y+6, {align:"right"});
  y += 12;

  // ---------- Tabela de itens (4 colunas) ----------
  const W_PROD=23.5, W_QDE=13, W_UNIT=13, W_TOTAL=18.5;
  ensureSpace(12);
  doc.setFont("helvetica","bold"); doc.setFontSize(7);
  doc.rect(margemX, y, W_PROD, 10, "S");
  doc.rect(margemX+W_PROD, y, W_QDE, 10, "S");
  doc.rect(margemX+W_PROD+W_QDE, y, W_UNIT, 10, "S");
  doc.rect(margemX+W_PROD+W_QDE+W_UNIT, y, W_TOTAL, 10, "S");
  doc.text("PRODUTO", margemX+W_PROD/2, y+6, {align:"center"});
  doc.text("QDE", margemX+W_PROD+W_QDE/2, y+6, {align:"center"});
  doc.text("R$ UNIT.", margemX+W_PROD+W_QDE+W_UNIT/2, y+6, {align:"center"});
  const valorX = margemX+W_PROD+W_QDE+W_UNIT+W_TOTAL/2;
  doc.text("VALOR", valorX, y+4, {align:"center"});
  doc.text("PRODUTO", valorX, y+8.5, {align:"center"});
  y += 12;

  let subtotal = 0;
  doc.setFont("helvetica","normal"); doc.setFontSize(9);

  (Array.isArray(p.itens)?p.itens:[]).forEach((it, idx)=>{
    const produto = String(it.descricao || it.produto || "");
    const qtd     = Number(it.qtd ?? it.quantidade ?? 0);
    const tipo    = (it.un || it.unidade || it.tipo || "UN").toUpperCase();
    const pu      = Number(it.precoUnit ?? it.preco ?? 0);
    const sub     = (typeof it.subtotal === 'number') ? Number(it.subtotal) : subtotalItem(it);

    const prodLines = splitToWidth(produto.toUpperCase(), W_PROD-2).slice(0,3);
    const rowHi = Math.max(14, 6 + prodLines.length*5);
    ensureSpace(rowHi);

    // caixas
    doc.rect(margemX, y, W_PROD, rowHi, "S");
    doc.rect(margemX+W_PROD, y, W_QDE, rowHi, "S");
    doc.rect(margemX+W_PROD+W_QDE, y, W_UNIT, rowHi, "S");
    doc.rect(margemX+W_PROD+W_QDE+W_UNIT, y, W_TOTAL, rowHi, "S");

    const center=(cx, lines)=>{ const block=(lines.length-1)*5; const base=y+(rowHi-block)/2; lines.forEach((ln,k)=>doc.text(ln,cx,base+k*5,{align:"center"})); };
    center(margemX+W_PROD/2, prodLines);
    center(margemX+W_PROD+W_QDE/2, [String(qtd), tipo]);
    center(margemX+W_PROD+W_QDE+W_UNIT/2, pu ? ["R$", pu.toFixed(2).replace('.',',')] : ["—"]);
    center(margemX+W_PROD+W_QDE+W_UNIT+W_TOTAL/2, sub ? ["R$", moneyBR(sub)] : ["—"]);

    y += rowHi;
    subtotal += sub;
    if (idx < (p.itens.length||0)-1) y += 2;
  });

  // ---------- Soma produtos ----------
  const w2tercos = Math.round(larguraCaixa*(2/3));
  const somaX = margemX + larguraCaixa - w2tercos;
  ensureSpace(11);
  drawKeyValueBox(doc, somaX, y, w2tercos, "SOMA PRODUTOS", "R$ " + moneyBR(subtotal), {rowH:10});
  y += 12;

  // ---------- Entrega / Frete ----------
  const tipo = (p?.entrega?.tipo || p.tipoEnt || 'ENTREGA').toUpperCase();
  const freteCobr = Number(p?.frete?.isento ? 0 : (p?.frete?.valorCobravel ?? p?.frete?.valorBase ?? p.freteValor ?? 0));
  const gap2=2; const entregaW=Math.round(larguraCaixa*(2/3)); const freteW=larguraCaixa-entregaW-gap2;

  ensureSpace(12); doc.setLineWidth(1.1);
  doc.rect(margemX, y, entregaW, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text(tipo, margemX+entregaW/2, y+6.5, {align:"center"});

  const freteX = margemX + entregaW + gap2;
  doc.rect(freteX, y, freteW, 10, "S");
  doc.text("FRETE", freteX+freteW/2, y+4, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(freteCobr ? moneyBR(freteCobr) : "ISENTO", freteX+freteW/2, y+8.2, {align:"center"});
  doc.setLineWidth(0.2);
  y += 12;

  // ---------- TOTAL ----------
  const total = subtotal + (freteCobr || 0);
  ensureSpace(11);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("TOTAL DO PEDIDO:", margemX+3, y+5.5);
  doc.text("R$ " + moneyBR(total), margemX+larguraCaixa-3, y+5.5, {align:"right"});
  y += 12;

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