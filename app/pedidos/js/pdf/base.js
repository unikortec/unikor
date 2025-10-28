// base.js
import {
  formatarData, diaDaSemanaExtenso, splitToWidth,
  moneyBRfromCents, nomeArquivoPedido,
  formatCNPJCPF, formatTelefone, formatCEP
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

  // 🔧 LARGURAS AJUSTADAS:
  // antes: W_PROD=23.5, W_QDE=13, W_UNIT=13, W_TOTAL=18.5
  // agora: PROD +3, QDE -2, TOTAL -1 → UNIT fica igual
  const W_PROD=26.5, W_QDE=11, W_UNIT=13, W_TOTAL=17.5;

  let y=12;
  const ensureSpace=(h)=>{ if (y+h>SAFE_BOTTOM){ doc.addPage([72,297],"portrait"); y=10; } };

  // Pequeno helper: ajusta a fonte para o texto caber na largura
  function fitAndText(txt, x, y, maxW, align="center", base=9, min=7){
    const save = doc.getFontSize();
    let size = base;
    doc.setFontSize(size);
    while (doc.getTextWidth(String(txt)) > (maxW - 1.5) && size > min){
      size -= .2;
      doc.setFontSize(size);
    }
    doc.text(String(txt), x, y, { align });
    doc.setFontSize(save);
  }

  // Cliente
  ensureSpace(14);
  y += drawKeyValueBox(doc, margemX, y, larguraCaixa, "CLIENTE", data.cliente, { rowH:12, titleSize:8, valueSize:8 }) + 1;

  // CNPJ / IE (com formatação BR)
  const gap1=1; const halfW=(larguraCaixa-gap1)/2;
  ensureSpace(12);
  drawCenteredKeyValueBox(
    doc, margemX, y, halfW, "CNPJ",
    formatCNPJCPF(data.cnpj),
    { rowH:10, titleSize:7, valueSize:8 }
  );
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

  // Contato/CEP (formatados)
  ensureSpace(12);
  drawCenteredKeyValueBox(
    doc, margemX, y, halfW, "CONTATO",
    formatTelefone(data.contato),
    { rowH:10, titleSize:7, valueSize:8 }
  );
  drawCenteredKeyValueBox(
    doc, margemX+halfW+gap1, y, halfW, "CEP",
    formatCEP(data.cep),
    { rowH:10, titleSize:7, valueSize:8 }
  );
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

  // Cabeçalho itens (com novas larguras)
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

    // ⬇️ PRODUTO: sem limite de linhas
    const prodLines = splitToWidth(doc, prod, W_PROD - 2.2);
    const rowHi = Math.max(14, 6 + prodLines.length * 5);
    ensureSpace(rowHi + (pesoTotalKgMil ? 6 : 0));

    // Caixas
    doc.rect(margemX, y, W_PROD, rowHi, "S");
    doc.rect(margemX + W_PROD, y, W_QDE, rowHi, "S");
    doc.rect(margemX + W_PROD + W_QDE, y, W_UNIT, rowHi, "S");
    doc.rect(margemX + W_PROD + W_QDE + W_UNIT, y, W_TOTAL, rowHi, "S");

    // Centraliza bloco verticalmente
    const centerLines = (cx, lines, colW) => {
      const block = (lines.length - 1) * 5;
      const baseY = y + (rowHi - block) / 2;
      lines.forEach((ln, k) => {
        fitAndText(ln, cx, baseY + k * 5, colW - 1.2, "center", 9, 7);
      });
    };

    // PRODUTO
    centerLines(margemX + W_PROD / 2, prodLines, W_PROD);

    // QDE + tipo (sempre cabendo)
    const qdeLines = (qtdStr ? [qtdStr, tipo] : [""]);
    centerLines(margemX + W_PROD + W_QDE / 2, qdeLines, W_QDE);

    // R$ UNIT com ajuste quando UN tem peso
    if (tipo === 'UN' && pesoTotalKgMil){
      const unitLines = precoTxt ? ["R$/KG", precoTxt] : ["—"];
      centerLines(margemX + W_PROD + W_QDE + W_UNIT / 2, unitLines, W_UNIT);
    } else {
      const unitLines = precoTxt ? ["R$", precoTxt] : ["—"];
      centerLines(margemX + W_PROD + W_QDE + W_UNIT / 2, unitLines, W_UNIT);
    }

    // VALOR PRODUTO
    const valLines = (totalCents > 0) ? ["R$", moneyBRfromCents(totalCents)] : ["—"];
    centerLines(margemX + W_PROD + W_QDE + W_UNIT + W_TOTAL / 2, valLines, W_TOTAL);

    y += rowHi;

    // (*) Peso total (quando UN com peso)
    if (tipo === 'UN' && pesoTotalKgMil) {
      const kgTxt = (pesoTotalKgMil / 1000).toFixed(3).replace('.', ',');
      doc.setFontSize(7); doc.setFont("helvetica", "italic");
      doc.text(`(*) Peso total: ${kgTxt} kg`, margemX + 3, y + 4);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      y += 5;
    }

    // Observações do item
    const obs = (it.obs || "").trim();
    if (obs) {
      const corpoLines = splitToWidth(doc, obs.toUpperCase(), larguraCaixa - 6);
      const obsH = 9 + corpoLines.length * 5;
      ensureSpace(obsH);
      doc.rect(margemX, y, larguraCaixa, obsH, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      const titulo = "OBSERVAÇÕES:"; const tx = margemX + 3, ty = y + 6;
      doc.text(titulo, tx, ty); doc.line(tx, ty + .8, tx + doc.getTextWidth(titulo), ty + .8);
      doc.setFont("helvetica", "normal");
      let baseY3 = y + 12; corpoLines.forEach((ln, ix) => doc.text(ln, margemX + 3, baseY3 + ix * 5));
      y += obsH;
    }

    subtotalCents += totalCents;
    if (idx < (data.itens?.length || 0) - 1) y += 2;
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
  }

  const nomeArq = nomeArquivoPedido(data.cliente, data.entregaISO, data.hora);
  const blob = doc.output('blob');
  return { blob, nomeArq, doc };
}