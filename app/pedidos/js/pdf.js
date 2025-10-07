// app/pedidos/js/pdf.js
import { ensureFreteBeforePDF, getFreteAtual } from './frete.js';
import { db, getTenantId, doc, getDoc } from './firebase.js';

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

/* ===== Precisão decimal (sem arredondar indevido) ===== */
// Converte "12,34" ou "12.34" -> 1234 (centavos)
function strToCents(str){
  const s = String(str ?? "").trim().replace(/\s+/g,"").replace(/\./g,"").replace(",",".");
  if (!s) return 0;
  // usa duas casas – arredondamento de centavos apenas aqui
  return Math.round(Number(s) * 100);
}
// Quantidade com até 3 casas (ex.: kg) em milésimos
function strToThousandths(str){
  const s = String(str ?? "").trim().replace(",",".");
  if (!s) return 0;
  return Math.round(Number(s) * 1000);
}
// Formata centavos -> "x,yy"
function moneyBRfromCents(cents){
  const v = Math.round(cents);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const reais = Math.floor(abs / 100);
  const cent = String(abs % 100).padStart(2, "0");
  return `${sign}${reais.toLocaleString("pt-BR")},${cent}`;
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

/* ===========================================================
   ==============   CONSTRUTORES DE PDF   ====================
   =========================================================== */

// 1) Constrói lendo a TELA (DOM)
export async function construirPDF(){
  await ensureFreteBeforePDF();

  // Coleta do DOM
  const form = {
    cliente     : (document.getElementById("cliente")?.value || "").trim().toUpperCase(),
    endereco    : (document.getElementById("endereco")?.value || "").trim().toUpperCase(),
    entregaISO  : document.getElementById("entrega")?.value || "",
    hora        : document.getElementById("horaEntrega")?.value || "",
    cnpj        : digitsOnly(document.getElementById("cnpj")?.value || ""),
    ie          : (document.getElementById("ie")?.value || "").toUpperCase(),
    cep         : digitsOnly(document.getElementById("cep")?.value || ""),
    contato     : digitsOnly(document.getElementById("contato")?.value || ""),
    obsGeralTxt : (document.getElementById("obsGeral")?.value || "").trim().toUpperCase(),
    tipoEnt     : (document.querySelector('input[name="tipoEntrega"]:checked')?.value || "ENTREGA").toUpperCase(),
    pagamento   : (()=>{ 
      const sel = document.getElementById("pagamento");
      const outro = document.getElementById("pagamentoOutro");
      let p = (sel?.value || "").toUpperCase();
      if (p === "OUTRO") {
        const o = (outro?.value || "").trim();
        if (o) p = o.toUpperCase();
      }
      return p;
    })(),
    itens: (() => {
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

        // >>> preserva o que foi DIGITADO (texto cru) <<<
        const qtdTxt = (quantidadeInput?.value ?? '').trim(); // pode ter 3 casas (kg)
        const precoTxt = (precoInput?.value ?? '').trim();    // "xx,yy" ou "xx.yy"

        // números para cálculo com precisão
        const qtdMil = strToThousandths(qtdTxt);
        const precoCents = strToCents(precoTxt);

        // Peso estimado a partir do nome quando tipo UN
        let pesoTotalKgMil = 0; // em milésimos de kg
        if (tipo === 'UN') {
          const s = (produto||'').toLowerCase().replace(',', '.').replace(/\s+/g,' ');
          const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b\.?/g;
          let m, last=null; while((m=re.exec(s))!==null) last=m;
          if (last){
            const raw = String(last[1]).replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'');
            const val = parseFloat(raw);
            if (isFinite(val) && val>0){
              const unit = last[2].toLowerCase();
              const kgUn = (unit.startsWith('kg') || unit.startsWith('quilo')) ? val : (val/1000);
              pesoTotalKgMil = Math.round((kgUn * 1000) * (Number(qtdTxt.replace(',','.')) || 0));
            }
          }
        }

        // ===== total em CENTAVOS, sem erro de float =====
        let totalCents = 0;
        if (tipo === 'UN' && pesoTotalKgMil > 0) {
          // (kg em milésimos) * (preço em centavos) / 1000
          totalCents = Math.round((pesoTotalKgMil * precoCents) / 1000);
        } else {
          // quantidade (milésimos para KG, inteiros para UN) * preço
          if (tipo === 'KG') {
            totalCents = Math.round((qtdMil * precoCents) / 1000);
          } else {
            const qtdInt = Math.round(Number(qtdTxt.replace(',','.') || 0));
            totalCents = qtdInt * precoCents;
          }
        }

        const obs = obsInput?.value?.trim() || '';
        return {
          produto, tipo,
          // preserva textos:
          qtdTxt, precoTxt,
          // números auxiliares:
          qtdMil, precoCents, totalCents,
          obs,
          _pesoTotalKgMil: pesoTotalKgMil
        };
      });
    })()
  };

  // Frete atual (UI)
  const frete = getFreteAtual() || { valorBase:0, valorCobravel:0, isento:false };
  const isentoMan = !!document.getElementById('isentarFrete')?.checked;

  return construirPDFBase({
    ...form,
    freteLabel: (isentoMan || frete.isento) ? "ISENTO" : ("R$ " + Number(frete.valorBase||0).toFixed(2)),
    freteCobravel: (isentoMan ? 0 : Number(frete.valorCobravel||frete.valorBase||0)),
  });
}

// 2) Constrói a partir de um DOCUMENTO do Firestore (payload salvo)
function normalizarPedidoSalvo(docData){
  const p = docData || {};
  const itens = Array.isArray(p.itens) ? p.itens.map(it=>{
    const produto = String(it.produto||'').trim();
    const tipo = String(it.tipo||'KG').toUpperCase();
    // Preferimos o total salvo; se não houver, calculamos com centavos
    const precoCents = Math.round(Number(it.precoUnit ?? it.preco ?? 0) * 100);
    const qtdTxt = String(it.quantidade ?? 0);
    const qtdMil = Math.round(Number(it.quantidade ?? 0) * 1000);
    let totalCents = Math.round(Number(it.total ?? 0) * 100);
    if (!totalCents){
      if (tipo === 'KG') totalCents = Math.round((qtdMil * precoCents) / 1000);
      else               totalCents = Math.round((Number(qtdTxt) || 0) * precoCents);
    }
    return {
      produto, tipo,
      qtdTxt, precoTxt: (Number(precoCents)/100).toFixed(2).replace('.', ','),
      qtdMil, precoCents, totalCents,
      obs: String(it.obs||'').trim(),
      _pesoTotalKgMil: 0
    };
  }) : [];

  return {
    cliente: String(p.cliente||p.clienteUpper||'').toUpperCase(),
    endereco: String(p.entrega?.endereco || p.endereco || '').toUpperCase(),
    entregaISO: p.dataEntregaISO || '',
    hora: p.horaEntrega || '',
    cnpj: digitsOnly(p.clienteFiscal?.cnpj || ''),
    ie: String(p.clienteFiscal?.ie || '').toUpperCase(),
    cep: digitsOnly(p.clienteFiscal?.cep || ''),
    contato: digitsOnly(p.clienteFiscal?.contato || ''),
    obsGeralTxt: String(p.obs || p.obsGeral || '').toUpperCase(),
    tipoEnt: String(p.entrega?.tipo || 'ENTREGA').toUpperCase(),
    pagamento: String(p.pagamento || '').toUpperCase(),
    itens,
    freteLabel: (p.frete?.isento ? "ISENTO" : ("R$ " + Number(p.frete?.valorBase||0).toFixed(2))),
    freteCobravel: Number(p.frete?.valorCobravel ?? p.frete?.valorBase ?? 0)
  };
}

async function construirPDFDePedidoSalvo(pedidoDocData){
  const norm = normalizarPedidoSalvo(pedidoDocData);
  return construirPDFBase(norm);
}

/* ===== Miolo de desenho compartilhado (DOM ou Firestore) ===== */
function construirPDFBase(data){
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:[72,297] });

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
  ensureSpace(12);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8);
  doc.text("FORMA DE PAGAMENTO", margemX + 3, y + 6);
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text((data.pagamento || "-").toUpperCase(), margemX + larguraCaixa - 3, y + 6, { align: "right" });
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

  // Itens
  let subtotalCents = 0;
  doc.setFont("helvetica","normal"); doc.setFontSize(9);

  (data.itens || []).forEach((it, idx) => {
    const prod = it.produto || "";
    const qtdStr = String(it.qtdTxt || "");
    const tipo = it.tipo || "KG";

    const precoTxt = it.precoTxt || ""; // texto como digitado
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

    if (tipo==='UN' && pesoTotalKgMil) {
      center(margemX+W_PROD+W_QDE+W_UNIT/2, precoTxt ? ["R$/KG", precoTxt] : ["—"]);
    } else {
      center(margemX+W_PROD+W_QDE+W_UNIT/2, precoTxt ? ["R$", precoTxt] : ["—"]);
    }

    center(margemX+W_PROD+W_QDE+W_UNIT+W_TOTAL/2,
      (totalCents > 0) ? ["R$", moneyBRfromCents(totalCents)] : ["—"]);

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
      let baseY2=y+12; corpoLines.forEach((ln,ix)=>doc.text(ln, margemX+3, baseY2+ix*5));
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

  // ENTREGA/RETIRADA
  doc.rect(margemX, y, entregaW, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text(data.tipoEnt, margemX+entregaW/2, y+6.5, {align:"center"});

  // FRETE
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
    let baseY2=y+12; corpoLines.forEach((ln,ix)=>doc.text(ln, margemX+3, baseY2+ix*5));
    y += obsH;
  }

  const nomeArq = nomeArquivoPedido(data.cliente, data.entregaISO, data.hora);
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
    if (window.showSaveFilePicker){
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

/* ========= REIMPRESSÃO DO FIRESTORE ========= */
export async function gerarPDFPreviewDePedidoFirestore(pedidoId){
  const tenantId = await getTenantId();
  const ref = doc(db, "tenants", tenantId, "pedidos", pedidoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Pedido não encontrado no Firestore.");

  const { blob } = await construirPDFDePedidoSalvo(snap.data() || {});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
}
// Exposto para a fila reconstruir PDF sem duplicar código:
export const __construirPDFBasePublic = construirPDFBase;