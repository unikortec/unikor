// app/pedidos/js/pdf.js
import { ensureFreteBeforePDF, getFreteAtual } from './frete.js';

const { jsPDF } = window.jspdf;

/* ========================= Helpers ========================= */
function digitsOnly(v) { return String(v || "").replace(/\D/g, ""); }
function formatarData(iso) { if (!iso) return ""; const [a,m,d]=iso.split("-"); return `${d}/${m}/${a.slice(-2)}`; }
function diaDaSemanaExtenso(iso){ if(!iso) return ""; const d=new Date(iso+"T00:00:00"); return d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase(); }
function splitToWidth(doc, t, w){ return doc.splitTextToSize(t||"", w); }
function twoFirstNamesCamel(client){
  const tokens = String(client||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9\s]+/g,'')
    .trim().split(/\s+/).slice(0,2);
  return tokens.map(t=>t.charAt(0).toUpperCase()+t.slice(1).toLowerCase())
               .join('')
               .replace(/[^A-Za-z0-9]/g,'') || 'Cliente';
}
function nomeArquivoPedido(cliente, entregaISO, horaEntrega) {
  const [ano,mes,dia] = String(entregaISO||'').split('-');
  const aa=(ano||'').slice(-2)||'AA';
  const hh=(horaEntrega||'').slice(0,2)||'HH';
  const mm=(horaEntrega||'').slice(3,5)||'MM';
  return `${twoFirstNamesCamel(cliente)}_${dia||'DD'}_${mes||'MM'}_${aa}_H${hh}-${mm}.pdf`;
}

// Lê itens do DOM (compatível com o itens.js atual)
function lerItensDaTela(){
  const itensContainer = document.getElementById('itens');
  if (!itensContainer) return [];
  const itemElements = Array.from(itensContainer.querySelectorAll('.item'));
  return itemElements.map(itemEl => {
    const produtoInput = itemEl.querySelector('.produto');
    const tipoSelect = itemEl.querySelector('.tipo-select');
    const quantidadeInput = itemEl.querySelector('.quantidade');
    const precoInput = itemEl.querySelector('.preco');
    const obsInput = itemEl.querySelector('.obsItem');

    const produto = produtoInput?.value?.trim() || '';
    const tipo = (tipoSelect?.value || 'KG').toUpperCase();
    const quantidade = parseFloat(quantidadeInput?.value || '0') || 0;
    const preco = parseFloat(precoInput?.value || '0') || 0;
    const obs = obsInput?.value?.trim() || '';

    // Peso estimado a partir do nome quando tipo UN
    let pesoTotalKg = 0;
    let kgPorUnidade = 0;
    if (tipo === 'UN') {
      const s = produto.toLowerCase().replace(',', '.').replace(/\s+/g,' ');
      const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b\.?/g;
      let m, last=null; while((m=re.exec(s))!==null) last=m;
      if (last){
        const raw = String(last[1]).replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'');
        const val = parseFloat(raw);
        if (isFinite(val) && val>0){
          const unit = last[2].toLowerCase();
          kgPorUnidade = (unit.startsWith('kg') || unit.startsWith('quilo')) ? val : (val/1000);
          pesoTotalKg = quantidade * kgPorUnidade;
        }
      }
    }

    const total = (tipo==='UN' && pesoTotalKg>0) ? (pesoTotalKg*preco) : (quantidade*preco);

    return { produto, tipo, quantidade, preco, obs, total, _pesoTotalKg:pesoTotalKg, _kgPorUnidade:kgPorUnidade };
  });
}

/* ================== Desenho de componentes ================= */
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

/* ================== Construção do PDF ====================== */
export async function construirPDF(){
  // Garante frete atualizado (para total e label)
  await ensureFreteBeforePDF();

  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:[72,297] });

  // Cabeçalho
  doc.setFont("helvetica","bold"); doc.setFontSize(11);
  doc.text("PEDIDO SERRA NOBRE", 36, 7, { align:"center" });
  doc.setLineWidth(0.3); doc.line(2,9,70,9);

  const margemX=2, larguraCaixa=68;
  const SAFE_BOTTOM=280;

  const W_PROD=23.5, W_QDE=13, W_UNIT=13, W_TOTAL=18.5;

  let y=12;
  const ensureSpace=(h)=>{ if (y+h>SAFE_BOTTOM){ doc.addPage([72,297],"portrait"); y=10; } };

  // Campos UI
  const cliente = document.getElementById("cliente")?.value?.trim()?.toUpperCase() || "";
  const endereco = document.getElementById("endereco")?.value?.trim()?.toUpperCase() || "";
  const entregaISO = document.getElementById("entrega")?.value || "";
  const hora = document.getElementById("horaEntrega")?.value || "";
  const cnpj = digitsOnly(document.getElementById("cnpj")?.value || "");
  const ie = (document.getElementById("ie")?.value || "").toUpperCase();
  const cep = digitsOnly(document.getElementById("cep")?.value || "");
  const contato = digitsOnly(document.getElementById("contato")?.value || "");
  const obsGeralTxt = (document.getElementById("obsGeral")?.value || "").trim().toUpperCase(); // <- nome único
  const tipoEnt = (document.querySelector('input[name="tipoEntrega"]:checked')?.value || "ENTREGA").toUpperCase();

  // pagamento
  const selPag = document.getElementById("pagamento");
  const outroPag = document.getElementById("pagamentoOutro");
  let pagamento = (selPag?.value || "").toUpperCase();
  if (pagamento === "OUTRO") {
    const txt = (outroPag?.value || "").trim();
    if (txt) pagamento = txt.toUpperCase();
  }

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

  // FORMA DE PAGAMENTO
  ensureSpace(12);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8);
  doc.text("FORMA DE PAGAMENTO", margemX + 3, y + 6);
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text((pagamento || "-").toUpperCase(), margemX + larguraCaixa - 3, y + 6, { align: "right" });
  y += 12;

  // Tabela itens - Cabeçalho
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

  const itens = lerItensDaTela();
  let subtotal = 0;
  doc.setFont("helvetica","normal"); doc.setFontSize(9);

  itens.forEach((it, idx) => {
    const prod = it.produto || "";
    const qtdStr = String(it.quantidade || 0);
    const tipo = it.tipo || "KG";
    const precoNum = parseFloat(it.preco) || 0;
    const totalNum = it.total || 0;
    const pesoTotalKg = it._pesoTotalKg || 0;

    const prodLines = splitToWidth(doc, prod, W_PROD-2).slice(0,3);
    const rowHi = Math.max(14, 6 + prodLines.length*5);
    ensureSpace(rowHi + (pesoTotalKg ? 6 : 0));

    doc.rect(margemX, y, W_PROD, rowHi, "S");
    doc.rect(margemX+W_PROD, y, W_QDE, rowHi, "S");
    doc.rect(margemX+W_PROD+W_QDE, y, W_UNIT, rowHi, "S");
    doc.rect(margemX+W_PROD+W_QDE+W_UNIT, y, W_TOTAL, rowHi, "S");

    const center=(cx, lines)=>{ const block=(lines.length-1)*5; const base=y+(rowHi-block)/2; lines.forEach((ln,k)=>doc.text(ln,cx,base+k*5,{align:"center"})); };

    center(margemX+W_PROD/2, prodLines);
    center(margemX+W_PROD+W_QDE/2, qtdStr ? [qtdStr, tipo] : [""]);

    if (tipo==='UN' && pesoTotalKg) {
      center(margemX+W_PROD+W_QDE+W_UNIT/2, precoNum ? ["R$/KG", precoNum.toFixed(2).replace(".", ",")] : ["—"]);
    } else {
      center(margemX+W_PROD+W_QDE+W_UNIT/2, precoNum ? ["R$", precoNum.toFixed(2).replace(".", ",")] : ["—"]);
    }

    center(margemX+W_PROD+W_QDE+W_UNIT+W_TOTAL/2,
      (totalNum > 0) ? ["R$", totalNum.toFixed(2).replace(".", ",")] : ["—"]);

    y += rowHi;

    if (tipo==='UN' && pesoTotalKg) {
      doc.setFontSize(7); doc.setFont("helvetica","italic");
      doc.text(`(*) Peso total: ${pesoTotalKg.toFixed(3)} kg`, margemX+3, y+4);
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
      let baseY2=y+12; corpoLines.forEach((ln,ix)=>doc.text(ln, margemX+3, baseY2+ix*5));
      y += obsH;
    }

    subtotal += totalNum;
    if (idx < itens.length-1) y += 2;
  });

  // Soma produtos
  const w2tercos = Math.round(larguraCaixa*(2/3));
  const somaX = margemX + larguraCaixa - w2tercos;
  ensureSpace(11);
  drawKeyValueBox(doc, somaX, y, w2tercos, "SOMA PRODUTOS", "R$ " + subtotal.toFixed(2), { rowH:10, titleSize:7, valueSize:7 });
  y += 12;

  // Entrega / Frete
  const gap2=2; const entregaW=Math.round(larguraCaixa*(2/3)); const freteW=larguraCaixa-entregaW-gap2;
  ensureSpace(12); doc.setLineWidth(1.1);

  // ENTREGA/RETIRADA
  doc.rect(margemX, y, entregaW, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text(tipoEnt, margemX+entregaW/2, y+6.5, {align:"center"});

  // FRETE
  const freteX = margemX + entregaW + gap2;
  const frete = getFreteAtual() || { valorBase:0, isento:false };
  const isentoMan = !!document.getElementById('isentarFrete')?.checked;
  doc.rect(freteX, y, freteW, 10, "S");
  doc.text("FRETE", freteX+freteW/2, y+4, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  const fretePreview = (isentoMan || frete.isento) ? "ISENTO" : ("R$ " + Number(frete.valorBase||0).toFixed(2));
  doc.text(fretePreview, freteX+freteW/2, y+8.2, {align:"center"});
  doc.setLineWidth(0.2);
  y += 12;

  // TOTAL
  const freteCobravelParaTotal = (isentoMan ? 0 : Number(frete.valorCobravel||frete.valorBase||0));
  const totalGeral = subtotal + freteCobravelParaTotal;
  ensureSpace(11);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("TOTAL DO PEDIDO:", margemX+3, y+5.5);
  doc.text("R$ " + totalGeral.toFixed(2), margemX+larguraCaixa-3, y+5.5, {align:"right"});
  y += 12;

  if (obsGeralTxt){
    const corpoLines = splitToWidth(doc, obsGeralTxt.toUpperCase(), larguraCaixa-6);
    const obsH = 9 + corpoLines.length*5;
    ensureSpace(obsH);
    doc.rect(margemX, y, larguraCaixa, obsH, "S");
    doc.setFont("helvetica","bold"); doc.setFontSize(9);
    const titulo="OBSERVAÇÕES GERAIS:"; const tx=margemX+3, ty=y+6;
    doc.text(titulo, tx, ty); doc.line(tx, ty+.8, tx+doc.getTextWidth(titulo), ty+.8);
    doc.setFont("helvetica","normal");
    let baseY2=y+12; corpoLines.forEach((ln,ix)=>doc.text(ln, margemX+3, baseY2+ix*5));
    y += obsH;
  }

  const nomeArq = nomeArquivoPedido(cliente, entregaISO, hora);

  // Retorna blob/documento para salvar/compartilhar/Drive
  const blob = doc.output('blob');
  return { blob, nomeArq, doc };
}

/* =================== APIs públicas =================== */
export async function gerarPDFPreview(){
  const { blob } = await construirPDF();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function salvarPDFLocal(){
  const { blob, nomeArq } = await construirPDF();
  try{
    // @ts-ignore
    if (window.showSaveFilePicker){
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: nomeArq,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { nome: nomeArq };
    }
  }catch{}
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArq;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 10000);
  return { nome: nomeArq };
}

export async function compartilharPDFNativo(){
  const { blob, nomeArq } = await construirPDF();
  const file = new File([blob], nomeArq, { type: 'application/pdf' });

  try{
    if (navigator.canShare && navigator.canShare({ files:[file] })) {
      await navigator.share({ title: 'Pedido', text: 'Segue o PDF do pedido.', files: [file] });
      return { compartilhado:true };
    }
  }catch(e){
    if (String(e).includes('AbortError')) return { compartilhado:false, cancelado:true };
    throw e;
  }

  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(()=>URL.revokeObjectURL(url), 10000);
  return { compartilhado:false, fallback:true };
}

// também exportamos o builder (usado pela fila/drive)
export { construirPDF };