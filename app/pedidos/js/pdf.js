import { ensureFreteBeforePDF, getFreteAtual } from './frete.js';

const { jsPDF } = window.jspdf;

// helpers
function digitsOnly(v) { return String(v || "").replace(/\D/g, ""); }
function formatarData(iso) { if (!iso) return ""; const [a,m,d]=iso.split("-"); return `${d}/${m}/${a.slice(-2)}`; }
function diaDaSemanaExtenso(iso){ if(!iso) return ""; const d=new Date(iso+"T00:00:00"); return d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase(); }
function splitToWidth(doc, t, w){ return doc.splitTextToSize(t||"", w); }
function twoFirstNamesCamel(client){
  const tokens = String(client||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9\s]+/g,' ').trim().split(/\s+/).slice(0,2);
  return tokens.map(t=>t.charAt(0).toUpperCase()+t.slice(1).toLowerCase()).join('').replace(/[^A-Za-z0-9]/g,'') || 'Cliente';
}
function nomeArquivoPedido(cliente, entregaISO, horaEntrega) {
  const [ano,mes,dia] = String(entregaISO||'').split('-');
  const aa=(ano||'').slice(-2)||'AA'; const hh=(horaEntrega||'').slice(0,2)||'HH'; const mm=(horaEntrega||'').slice(3,5)||'MM';
  return `${twoFirstNamesCamel(cliente)}_${dia||'DD'}_${mes||'MM'}_${aa}_H${hh}-${mm}.pdf`; // <-- H
}

// ler itens do DOM
function lerItensDaTela(){
  const itensContainer = document.getElementById('itens');
  if (!itensContainer) return [];
  const itemElements = Array.from(itensContainer.querySelectorAll('.item'));
  return itemElements.map(itemEl => {
    const produto = itemEl.querySelector('.produto')?.value?.trim() || '';
    const tipo = itemEl.querySelector('.tipo-select')?.value || 'KG';
    const q = parseFloat(itemEl.querySelector('.quantidade')?.value || '0') || 0;
    const p = parseFloat(itemEl.querySelector('.preco')?.value || '0') || 0;
    const obs = itemEl.querySelector('.obsItem')?.value?.trim() || '';

    // UN com peso embutido
    let pesoKg = 0, kgUn = 0;
    if (tipo === 'UN') {
      const m = /(\d+(?:[.,]\d+)?)[\s]*(kg|quilo|quilos|g|gr|grama|gramas)\b/.exec(produto.toLowerCase());
      if (m){
        const v = parseFloat(m[1].replace(',', '.')) || 0;
        kgUn = (m[2] === 'kg' || m[2].startsWith('quilo')) ? v : v/1000;
        pesoKg = q * kgUn;
      }
    }
    const total = (tipo==='UN' && pesoKg>0) ? pesoKg * p : q * p;

    return { produto, tipo, quantidade:q, preco:p, obs, total, _pesoTotalKg:pesoKg, _kgPorUnidade:kgUn };
  });
}

function drawCenteredKeyValueBox(doc, x,y,w, label, value, opts={}){
  const { rowH=12, titleSize=7, valueSize=7 } = opts;
  doc.setDrawColor(0); doc.setLineWidth(0.2); doc.rect(x,y,w,rowH,"S");
  const baseY = y + rowH/2;
  doc.setFont("helvetica","bold"); doc.setFontSize(titleSize);
  doc.text(String(label||"").toUpperCase(), x+w/2, baseY-2.2, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(valueSize);
  doc.text(String(value||"").toUpperCase(), x+w/2, baseY+3.2, {align:"center"});
  return rowH;
}
function drawKeyValueBox(doc, x,y,w, label, value, opts={}){
  const { rowH=10, titleSize=7, valueSize=7 } = opts;
  doc.setDrawColor(0); doc.setLineWidth(0.2); doc.rect(x,y,w,rowH,"S");
  const yBase = y + rowH/2 + .5;
  doc.setFont("helvetica","bold"); doc.setFontSize(titleSize);
  const ltxt = (String(label||"").toUpperCase() + ": "); const lW = doc.getTextWidth(ltxt);
  doc.text(ltxt, x+3, yBase);
  doc.setFont("helvetica","normal"); doc.setFontSize(valueSize);
  doc.text(String(value||"").toUpperCase(), x+3+lW, yBase);
  return rowH;
}

export async function montarPDF(){
  await ensureFreteBeforePDF();

  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:[72,297] });

  // Cabeçalho
  doc.setFont("helvetica","bold"); doc.setFontSize(11);
  doc.text("PEDIDO SERRA NOBRE", 36, 7, { align:"center" });
  doc.setLineWidth(0.3); doc.line(2,9,70,9);

  const margemX=2, larguraCaixa=68;
  const W_PROD=23.5, W_QDE=13, W_UNIT=13, W_TOTAL=18.5;
  const SAFE_BOTTOM=280;
  let y=12;
  function ensureSpace(h){ if (y+h>SAFE_BOTTOM){ doc.addPage([72,297],"portrait"); y=10; } }

  // Campos UI
  const cliente = document.getElementById("cliente")?.value?.trim()?.toUpperCase() || "";
  const endereco = document.getElementById("endereco")?.value?.trim()?.toUpperCase() || "";
  const entregaISO = document.getElementById("entrega")?.value || "";
  const hora = document.getElementById("horaEntrega")?.value || "";
  const cnpj = digitsOnly(document.getElementById("cnpj")?.value || "");
  const ie = (document.getElementById("ie")?.value || "").toUpperCase();
  const cep = digitsOnly(document.getElementById("cep")?.value || "");
  const contato = digitsOnly(document.getElementById("contato")?.value || "");
  const obsG = (document.getElementById("obsGeral")?.value || "").trim().toUpperCase();
  const tipoEnt = document.querySelector('input[name="tipoEntrega"]:checked')?.value || "ENTREGA";

  // Cliente
  ensureSpace(14);
  y += drawKeyValueBox(doc, margemX, y, larguraCaixa, "CLIENTE", cliente, { rowH:12, titleSize:8, valueSize:8 }) + 1;

  // CNPJ / IE
  const gap1=1; const halfW=(larguraCaixa-gap1)/2;
  ensureSpace(12);
  drawCenteredKeyValueBox(doc, margemX, y, halfW, "CNPJ", cnpj, { rowH:10, titleSize:7, valueSize:8 });
  drawCenteredKeyValueBox(doc, margemX+halfW+gap1, y, halfW, "I.E.", ie, { rowH:10, titleSize:7, valueSize:8 });
  y += 11;

  // Endereço
  const pad=3, innerW=larguraCaixa-pad*2;
  const linhasEnd = splitToWidth(doc, endereco, innerW);
  const rowH = Math.max(12, 6 + linhasEnd.length*5 + 4);
  ensureSpace(rowH);
  doc.setDrawColor(0); doc.setLineWidth(0.2); doc.rect(margemX,y,larguraCaixa,rowH,"S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.text("ENDEREÇO", margemX+pad, y+5);
  doc.setFont("helvetica","normal"); doc.setFontSize(8);
  const baseY = y+9; linhasEnd.forEach((ln,i)=>doc.text(ln, margemX+pad, baseY+i*5));
  y += rowH + 1;

  // Contato/CEP
  ensureSpace(12);
  drawCenteredKeyValueBox(doc, margemX, y, halfW, "CONTATO", contato, { rowH:10, titleSize:7, valueSize:8 });
  drawCenteredKeyValueBox(doc, margemX+halfW+gap1, y, halfW, "CEP", cep, { rowH:10, titleSize:7, valueSize:8 });
  y += 11;

  // Dia/Data/Hora
  ensureSpace(12);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("DIA DA SEMANA:", margemX+3, y+6);
  doc.text(diaDaSemanaExtenso(entregaISO), margemX+larguraCaixa/2+12, y+6, {align:"center"});
  y += 11;

  const halfW2 = (larguraCaixa-1)/2;
  doc.setFont("helvetica","bold"); doc.setFontSize(7);
  doc.rect(margemX, y, halfW2, 10, "S");
  doc.rect(margemX+halfW2+1, y, halfW2, 10, "S");
  doc.text("DATA ENTREGA", margemX+halfW2/2, y+4, {align:"center"});
  doc.text("HORÁRIO ENTREGA", margemX+halfW2+1+halfW2/2, y+4, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(formatarData(entregaISO), margemX+halfW2/2, y+8, {align:"center"});
  doc.text(hora, margemX+halfW2+1+halfW2/2, y+8, {align:"center"});
  y += 12;

  // Cabeçalho itens
  ensureSpace(14);
  doc.setFont("helvetica","bold"); doc.setFontSize(7);
  const W_PROD=23.5, W_QDE=13, W_UNIT=13, W_TOTAL=18.5;
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

  const itens = lerItensDaTela();
  let subtotal = 0;
  doc.setFont("helvetica","normal"); doc.setFontSize(9);

  itens.forEach((it, idx) => {
    const prodLines = splitToWidth(doc, it.produto || "", W_PROD-2).slice(0,3);
    const rowHi = Math.max(14, 6 + prodLines.length*5);
    const pesoTotalKg = it._pesoTotalKg || 0;
    ensureSpace(rowHi + (pesoTotalKg ? 6 : 0));

    // cells
    doc.rect(margemX, y, W_PROD, rowHi, "S");
    doc.rect(margemX+W_PROD, y, W_QDE, rowHi, "S");
    doc.rect(margemX+W_PROD+W_QDE, y, W_UNIT, rowHi, "S");
    doc.rect(margemX+W_PROD+W_QDE+W_UNIT, y, W_TOTAL, rowHi, "S");

    const center=(cx, lines)=>{ const block=(lines.length-1)*5; const base=y+(rowHi-block)/2; lines.forEach((ln,k)=>doc.text(ln,cx,base+k*5,{align:"center"})); };
    center(margemX+W_PROD/2, prodLines);
    center(margemX+W_PROD+W_QDE/2, [String(it.quantidade||0), it.tipo||'KG']);

    const precoNum = parseFloat(it.preco)||0;
    if (it.tipo==='UN' && pesoTotalKg) {
      center(margemX+W_PROD+W_QDE+W_UNIT/2, precoNum ? ["R$/KG", precoNum.toFixed(2).replace(".", ",")] : ["—"]);
    } else {
      center(margemX+W_PROD+W_QDE+W_UNIT/2, precoNum ? ["R$", precoNum.toFixed(2).replace(".", ",")] : ["—"]);
    }

    const totalNum = it.total || 0;
    center(margemX+W_PROD+W_QDE+W_UNIT+W_TOTAL/2, (totalNum>0) ? ["R$", totalNum.toFixed(2).replace(".", ",")] : ["—"]);
    y += rowHi;

    if (it.tipo==='UN' && pesoTotalKg) {
      doc.setFontSize(7); doc.setFont("helvetica","italic");
      doc.text(`(*) Peso total: ${pesoTotalKg.toFixed(3)} kg`, margemX+3, y+4);
      doc.setFont("helvetica","normal"); doc.setFontSize(9);
      y += 5;
    }

    const obs = (it.obs||"").trim();
    if (obs){
      const linhas = splitToWidth(doc, obs.toUpperCase(), 68-6);
      const h = 9 + linhas.length*5;
      ensureSpace(h);
      doc.rect(margemX, y, 68, h, "S");
      doc.setFont("helvetica","bold"); doc.setFontSize(9);
      const t="OBSERVAÇÕES:"; const tx=margemX+3, ty=y+6;
      doc.text(t, tx, ty); doc.line(tx, ty+.8, tx+doc.getTextWidth(t), ty+.8);
      doc.setFont("helvetica","normal");
      let baseY2=y+12; linhas.forEach((ln,i)=>doc.text(ln, margemX+3, baseY2+i*5));
      y += h;
    }

    subtotal += totalNum;
    if (idx < itens.length-1) y += 2;
  });

  // soma produtos
  const w2tercos = Math.round(68*(2/3));
  const somaX = 2 + 68 - w2tercos;
  ensureSpace(11);
  drawKeyValueBox(doc, somaX, y, w2tercos, "SOMA PRODUTOS", "R$ " + subtotal.toFixed(2), { rowH:10, titleSize:7, valueSize:7 });
  y += 12;

  // entrega/frete
  const gap2=2; const entregaW=Math.round(68*(2/3)); const freteW=68-entregaW-gap2;
  ensureSpace(12); doc.setLineWidth(1.1);

  doc.rect(2, y, entregaW, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text(tipoEnt, 2+entregaW/2, y+6.5, {align:"center"});

  const freteX = 2 + entregaW + gap2;
  const frete = getFreteAtual() || { valorBase:0, valorCobravel:0, isento:false };
  const isentoMan = !!document.getElementById('isentarFrete')?.checked;
  doc.rect(freteX, y, freteW, 10, "S");
  doc.text("FRETE", freteX+freteW/2, y+4, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  const fretePreview = (isentoMan || frete.isento) ? "ISENTO" : ("R$ " + Number(frete.valorBase||0).toFixed(2));
  doc.text(fretePreview, freteX+freteW/2, y+8.2, {align:"center"});
  doc.setLineWidth(0.2);
  y += 12;

  // total
  const freteCobravelParaTotal = (isentoMan ? 0 : Number(frete.valorCobravel||0));
  const totalGeral = subtotal + freteCobravelParaTotal;
  ensureSpace(11);
  doc.rect(2, y, 68, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("TOTAL DO PEDIDO:", 5, y+5.5);
  doc.text("R$ " + totalGeral.toFixed(2), 2+68-3, y+5.5, {align:"right"});
  y += 12;

  if (obsG){
    const linhas = splitToWidth(doc, obsG.toUpperCase(), 68-6);
    const h = 9 + linhas.length*5;
    ensureSpace(h);
    doc.rect(2, y, 68, h, "S");
    doc.setFont("helvetica","bold"); doc.setFontSize(9);
    const t="OBSERVAÇÕES GERAIS:"; const tx=2+3, ty=y+6;
    doc.text(t, tx, ty); doc.line(tx, ty+.8, tx+doc.getTextWidth(t), ty+.8);
    doc.setFont("helvetica","normal");
    let baseY2=y+12; linhas.forEach((ln,i)=>doc.text(ln, 2+3, baseY2+i*5));
    y += h;
  }

  const nomeArq = nomeArquivoPedido(cliente, entregaISO, hora);
  doc.save(nomeArq);
}

// salvar local (download) e compartilhar nativo
export async function salvarPDFLocal() {
  await ensureFreteBeforePDF();
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:[72,297] });
  // reutiliza montagem completa
  await montarPDF(doc); // monta e salva automaticamente; se quiser download sem abrir, poderíamos adaptar
}

export async function compartilharPDFNativo() {
  await ensureFreteBeforePDF();

  // gerar PDF em memória
  const tmp = new jsPDF({ orientation:"portrait", unit:"mm", format:[72,297] });
  await montarPDF(tmp); // monta e salva; para share precisamos blob:
  const blob = tmp.output('blob');

  const cliente = document.getElementById("cliente")?.value || "Cliente";
  const entregaISO = document.getElementById("entrega")?.value || "";
  const hora = document.getElementById("horaEntrega")?.value || "";
  const filename = nomeArquivoPedido(cliente, entregaISO, hora);

  if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: 'application/pdf' })] })) {
    try {
      const file = new File([blob], filename, { type: 'application/pdf' });
      await navigator.share({ files: [file], title: 'Pedido', text: filename });
      return;
    } catch (e) {
      // fallback
    }
  }

  // fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
