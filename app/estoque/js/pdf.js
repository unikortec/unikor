import { fmt3, round3, dtLabel } from "./constants.js";
import { FAMILIAS, itensDigitadosDaFamilia } from "./catalog.js";
import { getPriceKg, getMinKg } from "./prices.js";
import { sessao, ultimo } from "./store.js";

/* Paletas para PDF (não depende do CSS) */
const PALETAS = [
  {soft:'#ecfdf5',strong:'#10b981'},
  {soft:'#f0fdf4',strong:'#22c55e'},
  {soft:'#f7fee7',strong:'#84cc16'},
  {soft:'#eef2ff',strong:'#6366f1'},
  {soft:'#fff7ed',strong:'#f59e0b'},
  {soft:'#fef2f2',strong:'#ef4444'},
  {soft:'#f0f9ff',strong:'#06b6d4'},
  {soft:'#fdf4ff',strong:'#a855f7'},
  {soft:'#f1f5f9',strong:'#334155'},
  {soft:'#fff1f2',strong:'#f43f5e'},
  {soft:'#fffbe7',strong:'#d97706'} // Diversos
];
const hex2rgb=h=>{h=h.replace('#','');return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)}};

function headerCell2(doc, text, xCenter, topY, boxH, maxW){
  const lines = doc.splitTextToSize(String(text).replace(/\s*\n\s*/g,'\n'), maxW).slice(0,2);
  const lh = 12;
  const totH = lines.length*lh;
  const startY = topY + (boxH - totH)/2 + 2;
  lines.forEach((ln,i)=>doc.text(ln, xCenter, startY + i*lh, {align:'center'}));
  return topY + boxH;
}

export function snapshotFromSession(){
  const s={};
  for(const fam of FAMILIAS){
    const famName=fam.nome;
    const prods = Object.keys(sessao[famName]||{});
    for(const p of prods){
      const v = sessao[famName]?.[p];
      if(!v) continue;
      const rk=round3(v.RESFRIADO_KG||0), ck=round3(v.CONGELADO_KG||0);
      if(rk<=0 && ck<=0) continue;
      s[famName] ??= {};
      s[famName][p] = { RESFRIADO_KG:rk, CONGELADO_KG:ck, SUM_KG:round3(rk+ck) };
    }
  }
  return s;
}
export function snapshotNow(){
  const now = new Date();
  return {dateISO:now.toISOString(), dateLabel:dtLabel(now), data:snapshotFromSession()};
}

export async function pdfEstoqueBlob(){
  const { jsPDF } = window.jspdf;
  const doc=new jsPDF({unit:'pt', format:'a4', orientation:'landscape'});
  const W=doc.internal.pageSize.getWidth();
  const margin=36; let y=margin;

  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('ESTOQUE DO DIA', W/2, y+10, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text(new Date().toLocaleString('pt-BR'), W/2, y+26, {align:'center'});
  y+=44;

  const cols = 4;
  const colW = (W - margin*2) / cols;
  const X = (i)=> margin + colW*(i+0.5);

  const headerTop = y, headerBoxH = 30;
  doc.setFillColor(30,127,70);
  doc.rect(margin, headerTop, W - margin*2, headerBoxH, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.setTextColor(255,255,255);
  doc.text('PRODUTO',         X(0), headerTop + 20, {align:'center'});
  doc.text('SOMA (KG)',       X(1), headerTop + 20, {align:'center'});
  doc.text('ESTOQUE MÍNIMO',  X(2), headerTop + 20, {align:'center'});
  doc.text('SUGESTÃO COMPRA', X(3), headerTop + 20, {align:'center'});

  y = headerTop + headerBoxH + 6;
  doc.setTextColor(0,0,0);
  doc.setFont('helvetica','normal'); doc.setFontSize(9);

  for(let i=0;i<FAMILIAS.length;i++){
    const fam=FAMILIAS[i].nome;
    const itens = itensDigitadosDaFamilia(fam);
    if(itens.length===0) continue;

    if(y>540){ doc.addPage(); y=margin; }

    const pal=PALETAS[i%PALETAS.length];
    const soft=hex2rgb(pal.soft); const strong=hex2rgb(pal.strong);
    // Cabeçalho da família
    doc.setFillColor(soft.r,soft.g,soft.b); doc.rect(margin,y,W-margin*2,22,'F');
    doc.setTextColor(strong.r,strong.g,strong.b);
    doc.setFont('helvetica','bold'); doc.setFontSize(13);
    doc.text(fam, W/2, y+15, {align:'center'});
    doc.setTextColor(0,0,0);
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    y+=28;

    let sumR=0,sumC=0,sumM=0, sumSug=0;
    let rowIndex = 0;

    for(const p of itens){
      const v = sessao[fam]?.[p] || {RESFRIADO_KG:0,CONGELADO_KG:0};
      const rk=round3(v.RESFRIADO_KG||0), ck=round3(v.CONGELADO_KG||0), sk=round3(rk+ck);
      const min = getMinKg(fam,p);
      const sug = Math.max(0, round3(min - sk));

      if(y>560){ doc.addPage(); y=margin; }

      // ZEBRA de linhas (mesma paleta, mais clarinha)
      if ((rowIndex % 2) === 1){
        doc.setFillColor(soft.r, soft.g, soft.b);
        doc.rect(margin, y-10, W - margin*2, 24, 'F');
      }
      rowIndex++;

      doc.setFont('helvetica','bold'); doc.text(p, X(0), y, {align:'center'});
      doc.setFont('helvetica','normal');
      doc.text(fmt3(sk),  X(1), y, {align:'center'});
      doc.text(fmt3(min), X(2), y, {align:'center'});
      doc.text(fmt3(sug), X(3), y, {align:'center'});

      y += 14;

      doc.setFontSize(8.5);
      doc.setTextColor(60, 78, 65);
      doc.text(`Resfriado: ${fmt3(rk)} kg  |  Congelado: ${fmt3(ck)} kg`, X(0), y, {align:'center'});
      doc.setTextColor(0,0,0);
      doc.setFontSize(9);

      doc.setDrawColor(226,232,240);
      doc.setLineDash([2, 2], 0);
      doc.line(margin, y+5, W - margin, y+5);
      doc.setLineDash();

      y += 12;

      sumR+=rk; sumC+=ck; sumM+=min; sumSug+=sug;
    }

    doc.setFillColor(216,243,226);
    doc.rect(margin,y-8,W-margin*2,20,'F');
    doc.setFont('helvetica','bold');
    doc.text('TOTAL',                     X(0), y+4, {align:'center'});
    doc.text(fmt3(round3(sumR+sumC)),    X(1), y+4, {align:'center'});
    doc.text(fmt3(sumM),                 X(2), y+4, {align:'center'});
    doc.text(fmt3(sumSug),               X(3), y+4, {align:'center'});
    doc.setFont('helvetica','normal');
    y+=22;
  }
  return doc.output('blob');
}

export async function pdfPosicaoBlob(){
  const { jsPDF } = window.jspdf;
  const doc=new jsPDF({unit:'pt', format:'a4', orientation:'landscape'});
  const W=doc.internal.pageSize.getWidth();
  const margin=36; let y=margin;

  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('POSIÇÃO DE ESTOQUE — VALOR EM R$', W/2, y+10, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text(new Date().toLocaleString('pt-BR'), W/2, y+26, {align:'center'});
  y+=44;

  const lastLabel = ultimo.value?.dateLabel || 'ANTERIOR';
  const cols = 5;
  const colW = (W - margin*2) / cols;
  const X = (i)=> margin + colW*(i+0.5);

  const headerTop = y, headerBoxH = 26;
  doc.setFillColor(30,127,70);
  doc.rect(margin, headerTop, W - margin*2, headerBoxH, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold'); doc.setFontSize(10);
  y = headerCell2(doc, 'PRODUTOS',             X(0), headerTop, headerBoxH, colW-16);
  headerCell2(doc, `${lastLabel} ESTOQUE`,     X(1), headerTop, headerBoxH, colW-16);
  headerCell2(doc, `${lastLabel} VALOR`,       X(2), headerTop, headerBoxH, colW-16);
  headerCell2(doc, 'ESTOQUE\nATUAL',           X(3), headerTop, headerBoxH, colW-16);
  headerCell2(doc, 'VALOR\nESTOQUE',           X(4), headerTop, headerBoxH, colW-16);
  doc.setTextColor(0,0,0);
  y += 10; doc.line(margin,y,W-margin,y); y+=8;
  doc.setFont('helvetica','normal'); doc.setFontSize(9);

  for(let i=0;i<FAMILIAS.length;i++){
    const fam=FAMILIAS[i].nome;
    const itens = itensDigitadosDaFamilia(fam);
    if(itens.length===0) continue;

    if(y>540){ doc.addPage(); y=margin; }

    const pal=PALETAS[i%PALETAS.length];
    const soft=hex2rgb(pal.soft); const strong=hex2rgb(pal.strong);
    doc.setFillColor(soft.r,soft.g,soft.b);
    doc.rect(margin,y,W-margin*2,22,'F');
    doc.setTextColor(strong.r,strong.g,strong.b);
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text(fam, W/2, y+14, {align:'center'});
    doc.setTextColor(0,0,0);
    y+=28;

    let sumLastKG=0, sumLastR$=0, sumNowKG=0, sumNowR$=0;
    let rowIndex = 0;

    for(const p of itens){
      const vNow = sessao[fam]?.[p] || {RESFRIADO_KG:0,CONGELADO_KG:0};
      const nowKg = round3((vNow.RESFRIADO_KG||0)+(vNow.CONGELADO_KG||0));
      const price = getPriceKg(fam,p);

      const vLast = ultimo.value?.data?.[fam]?.[p] || {SUM_KG:0};
      const lastKg = round3(vLast.SUM_KG||0);

      const lastVal = round3(lastKg*price);
      const nowVal  = round3(nowKg*price);

      if(y>560){ doc.addPage(); y=margin; }

      if ((rowIndex % 2) === 1){
        doc.setFillColor(soft.r, soft.g, soft.b);
        doc.rect(margin, y-10, W - margin*2, 22, 'F');
      }
      rowIndex++;

      doc.text(p, X(0), y, {align:'center'});
      doc.text(`${fmt3(lastKg)} KG`, X(1), y, {align:'center'});
      doc.text(lastVal.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), X(2), y, {align:'center'});
      doc.text(`${fmt3(nowKg)} KG`, X(3), y, {align:'center'});
      doc.text(nowVal.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),  X(4), y, {align:'center'});

      sumLastKG+=lastKg; sumLastR$+=lastVal; sumNowKG+=nowKg; sumNowR$+=nowVal;
      y+=16;
    }

    doc.setFillColor(235, 250, 240);
    doc.rect(margin,y-10,W-margin*2,18,'F');
    doc.setFont('helvetica','bold');
    doc.text('TOTAL',                X(0), y, {align:'center'});
    doc.text(`${fmt3(sumLastKG)} KG`,X(1), y, {align:'center'});
    doc.text(sumLastR$.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), X(2), y, {align:'center'});
    doc.text(`${fmt3(sumNowKG)} KG`, X(3), y, {align:'center'});
    doc.text(sumNowR$.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),  X(4), y, {align:'center'});
    doc.setFont('helvetica','normal'); y+=18;
  }
  return doc.output('blob');
}