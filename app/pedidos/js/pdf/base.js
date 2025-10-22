// base.js
import {
  formatarData, diaDaSemanaExtenso, splitToWidth,
  moneyBRfromCents, nomeArquivoPedido
} from './helpers.js';
import { drawCenteredKeyValueBox, drawKeyValueBox } from './components.js';

const { jsPDF } = window.jspdf;

export function construirPDFBase(data){
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:[72,297], compress:true });

  // Cabeçalho
  doc.setFont("helvetica","bold"); doc.setFontSize(11);
  doc.text("PEDIDO SERRA NOBRE", 36, 7, { align:"center" });
  doc.setLineWidth(0.3); doc.line(2,9,70,9);

  const margemX=2, larguraCaixa=68, SAFE_BOTTOM=280;
  const W_PROD=23.5, W_QDE=13, W_UNIT=13, W_TOTAL=18.5;
  let y=12;
  const ensureSpace=(h)=>{ if (y+h>SAFE_BOTTOM){ doc.addPage([72,297],"portrait"); y=10; } };

  // Cliente
  ensureSpace(14);
  y += drawKeyValueBox(doc, margemX, y, larguraCaixa, "CLIENTE", data.cliente, { rowH:12, titleSize:8, valueSize:8 }) + 1;

  // CNPJ / IE
  const gap1=1; const halfW=(larguraCaixa-gap1)/2;
  ensureSpace(12);
  drawCenteredKeyValueBox(doc, margemX, y, halfW, "CNPJ", data.cnpj, { rowH:10, titleSize:7, valueSize:8 });
  drawCenteredKeyValueBox(doc, margemX+halfW+gap1, y, halfW, "I.E.", data.ie, { rowH:10, titleSize:7, valueSize:8 });
  y += 11;

  // Endereço
  const pad=3, innerW=larguraCaixa-pad*2;
  const linhasEnd = splitToWidth(doc, data.endereco, innerW);
  const rowH = Math.max(12, 6 + linhasEnd.length*5 + 4);
  ensureSpace(rowH);
  doc.setDrawColor(0); doc.setLineWidth(0.2); doc.rect(margemX,y,larguraCaixa,rowH,"S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.text("ENDEREÇO", margemX+pad, y+5);
  doc.setFont("helvetica","normal"); doc.setFontSize(8);
  const baseY = y+9; linhasEnd.forEach((ln,i)=>doc.text(ln, margemX+pad, baseY+i*5));
  y += rowH + 1;

  // Contato/CEP
  ensureSpace(12);
  drawCenteredKeyValueBox(doc, margemX, y, halfW, "CONTATO", data.contato, { rowH:10, titleSize:7, valueSize:8 });
  drawCenteredKeyValueBox(doc, margemX+halfW+gap1, y, halfW, "CEP", data.cep, { rowH:10, titleSize:7, valueSize:8 });
  y += 11;

  // Dia/Data/Hora
  ensureSpace(12);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("DIA DA SEMANA:", margemX+3, y+6);
  doc.text(diaDaSemanaExtenso(data.entregaISO), margemX+larguraCaixa/2+12, y+6, {align:"center"});
  y += 11;

  const halfW2 = (larguraCaixa-1)/2;
  doc.setFont("helvetica","bold"); doc.setFontSize(7);
  doc.rect(margemX, y, halfW2, 10, "S");
  doc.rect(margemX+halfW2+1, y, halfW2, 10, "S");
  doc.text("DATA ENTREGA", margemX+halfW2/2, y+4, {align:"center"});
  doc.text("HORÁRIO ENTREGA", margemX+halfW2+1+halfW2/2, y+4, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(formatarData(data.entregaISO), margemX+halfW2/2, y+8, {align:"center"});
  doc.text(data.hora, margemX+halfW2+1+halfW2/2, y+8, {align:"center"});
  y += 12;

  // FORMA DE PAGAMENTO
  ensureSpace(14);
  const pagamentoTxt = (data.pagamento && String(data.pagamento).trim())
    ? String(data.pagamento).toUpperCase() : "NÃO INFORMADO";
  const padX = 3;
  const innerWPag = larguraCaixa - padX * 2;
  const linhasPag = splitToWidth(doc, pagamentoTxt, innerWPag);
  const boxH = Math.max(12, 7 + linhasPag.length * 4.4);
  doc.rect(margemX, y, larguraCaixa, boxH, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8);
  doc.text("FORMA DE PAGAMENTO", margemX + larguraCaixa/2, y + 5, { align: "center" });
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  let cy = y + 9;
  linhasPag.forEach(ln => { doc.text(ln, margemX + larguraCaixa/2, cy, { align: "center" }); cy += 4.4; });
  y += boxH + 2;

  // Cabeçalho itens
  ensureSpace(14);
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

  // Itens
  let subtotalCents = 0;
  doc.setFont("helvetica","normal"); doc.setFontSize(9);

  (data.itens || []).forEach((it, idx) => {
    const prod = it.produto || "";
    const qtdStr = String(it.qtdTxt || "");
    const tipo = it.tipo || "KG";
    const precoTxt = it.precoTxt || "";
    const totalCents = Math.round(it.totalCents || 0);
    const pesoTotalKgMil = Math.round(it._pesoTotalKgMil || 0);

    const prodLines = splitToWidth(doc, prod, W_PROD-2).slice(0,3);
    const rowHi = Math.max(14, 6 + prodLines.length*5);
    ensureSpace(rowHi + (pesoTotalKgMil ? 6 : 0));

    doc.rect(margemX, y, W_PROD, rowHi, "S");
    doc.rect(margemX+W_PROD, y, W_QDE, rowHi, "S");
    doc.rect(margemX+W_PROD+W_QDE, y, W_UNIT, rowHi, "S");
    doc.rect(margemX+W_PROD+W_QDE+W_UNIT, y, W_TOTAL, rowHi, "S");

    const center=(cx, lines)=>{ const block=(lines.length-1)*5; const base=y+(rowHi-block)/2; lines.forEach((ln,k)=>doc.text(ln,cx,base+k*5,{align:"center"})); };

    center(margemX+W_PROD/2, prodLines);
    center(margemX+W_PROD+W_QDE/2, (qtdStr ? [qtdStr, tipo] : [""]));
    if (tipo==='UN' && pesoTotalKgMil) center(margemX+W_PROD+W_QDE+W_UNIT/2, precoTxt ? ["R$/KG", precoTxt] : ["—"]);
    else                               center(margemX+W_PROD+W_QDE+W_UNIT/2, precoTxt ? ["R$",    precoTxt] : ["—"]);
    center(margemX+W_PROD+W_QDE+W_UNIT+W_TOTAL/2, (totalCents > 0) ? ["R$", moneyBRfromCents(totalCents)] : ["—"]);

    y += rowHi;

    if (tipo==='UN' && pesoTotalKgMil) {
      const kgTxt = (pesoTotalKgMil/1000).toFixed(3).replace('.', ',');
      doc.setFontSize(7); doc.setFont("helvetica","italic");
      doc.text(`(*) Peso total: ${kgTxt} kg`, margemX+3, y+4);
      doc.setFont("helvetica","normal"); doc.setFontSize(9);
      y += 5;
    }

    const obs = (it.obs||"").trim();
    if (obs){
      const corpoLines = splitToWidth(doc, obs.toUpperCase(), larguraCaixa-6);
      const obsH = 9 + corpoLines.length*5;
      ensureSpace(obsH);
      doc.rect(margemX, y, larguraCaixa, obsH, "S");
      doc.setFont("helvetica","bold"); doc.setFontSize(9);
      const titulo="OBSERVAÇÕES:"; const tx=margemX+3, ty=y+6;
      doc.text(titulo, tx, ty); doc.line(tx, ty+.8, tx+doc.getTextWidth(titulo), ty+.8);
      doc.setFont("helvetica","normal");
      let baseY3=y+12; corpoLines.forEach((ln,ix)=>doc.text(ln, margemX+3, baseY3+ix*5));
      y += obsH;
    }

    subtotalCents += totalCents;
    if (idx < (data.itens?.length||0)-1) y += 2;
  });

  // Soma produtos
  const w2tercos = Math.round(larguraCaixa*(2/3));
  const somaX = margemX + larguraCaixa - w2tercos;
  ensureSpace(11);
  drawKeyValueBox(
    doc, somaX, y, w2tercos, "SOMA PRODUTOS",
    "R$ " + moneyBRfromCents(subtotalCents),
    { rowH:10, titleSize:7, valueSize:7 }
  );
  y += 12;

  // Entrega / Frete
  const gap2=2; const entregaW=Math.round(larguraCaixa*(2/3)); const freteW=larguraCaixa-entregaW-gap2;
  ensureSpace(12); doc.setLineWidth(1.1);

  doc.rect(margemX, y, entregaW, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text(data.tipoEnt, margemX+entregaW/2, y+6.5, {align:"center"});

  const freteX = margemX + entregaW + gap2;
  doc.rect(freteX, y, freteW, 10, "S");
  doc.text("FRETE", freteX+freteW/2, y+4, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text((data.freteLabel || "—"), freteX+freteW/2, y+8.2, {align:"center"});
  doc.setLineWidth(0.2);
  y += 12;

  // TOTAL
  const totalGeralCents = subtotalCents + Math.round(Number(data.freteCobravel||0) * 100);
  ensureSpace(11);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("TOTAL DO PEDIDO:", margemX+3, y+5.5);
  doc.text("R$ " + moneyBRfromCents(totalGeralCents), margemX+larguraCaixa-3, y+5.5, {align:"right"});
  y += 12;

  if (data.obsGeralTxt){
    const corpoLines = splitToWidth(doc, data.obsGeralTxt.toUpperCase(), larguraCaixa-6);
    const obsH = 9 + corpoLines.length*5;
    ensureSpace(obsH);
    doc.rect(margemX, y, larguraCaixa, obsH, "S");
    doc.setFont("helvetica","bold"); doc.setFontSize(9);
    const titulo="OBSERVAÇÕES GERAIS:"; const tx=margemX+3, ty=y+6;
    doc.text(titulo, tx, ty); doc.line(tx, ty+.8, tx+doc.getTextWidth(titulo), ty+.8);
    doc.setFont("helvetica","normal");
    let baseY4=y+12; corpoLines.forEach((ln,ix)=>doc.text(ln, margemX+3, baseY4+ix*5));
    y += obsH;
  }

  const nomeArq = nomeArquivoPedido(data.cliente, data.entregaISO, data.hora);
  const blob = doc.output('blob');
  return { blob, nomeArq, doc };
}
