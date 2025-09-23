// js/pdf.js
import { ensureFreteBeforePDF, getFreteAtual } from './frete.js';
const { jsPDF } = window.jspdf;

/* ========================= Helpers ========================= */

function digitsOnly(v) { return String(v || "").replace(/\D/g, ""); }
function formatarData(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(-2)}`;
}
function diaDaSemanaExtenso(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString('pt-BR', { weekday: 'long' }).toUpperCase();
}
function splitToWidth(doc, t, w) { return doc.splitTextToSize(t || "", w); }

// Nome do arquivo: dois primeiros nomes em CamelCase + data/hora
function twoFirstNamesCamel(client) {
  const tokens = String(client || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]+/g, ' ')
    .trim().split(/\s+/).slice(0, 2);
  return tokens
    .map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join('')
    .replace(/[^A-Za-z0-9]/g, '') || 'Cliente';
}
function nomeArquivoPedido(cliente, entregaISO, horaEntrega) {
  const [ano, mes, dia] = String(entregaISO || '').split('-');
  const aa = (ano || '').slice(-2) || 'AA';
  const hh = (horaEntrega || '').slice(0, 2) || 'HH';
  const mm = (horaEntrega || '').slice(3, 5) || 'MM';
  const base = twoFirstNamesCamel(cliente);
  return `${base}_${dia || 'DD'}_${mes || 'MM'}_${aa}_${hh}-${mm}.pdf`;
}

// ==== Fallback robusto: extrai peso do nome do produto (ex.: "100G", "0,2 kg", "1.5kg")
function parsePesoFromProduto(nome){
  const s = String(nome||"").toLowerCase().replace(',', '.');
  const re = /(\d+(?:\.\d+)?)[\s]*(kg|quilo|quilos|g|gr|grama|gramas)\b/g;
  let m, last=null;
  while ((m = re.exec(s)) !== null) last = m;
  if(!last) return null;
  const val = parseFloat(last[1]);
  const unit = last[2];
  if(!isFinite(val) || val<=0) return null;
  return (unit === 'kg' || unit.startsWith('quilo')) ? val : (val/1000);
}

// Lê itens da UI (usa window.getItens; senão DOM com fallback de peso)
function lerItensDaTela() {
  if (typeof window.getItens === 'function') return window.getItens();

  const blocks = document.querySelectorAll('#itens .item');
  const out = [];
  blocks.forEach((el) => {
    const produto = el.querySelector('.produto')?.value || '';
    const tipo = el.querySelector('.tipo-select')?.value || 'KG';
    const quantidade = parseFloat(String(el.querySelector('.quantidade')?.value || '0').replace(',', '.')) || 0;
    const preco = parseFloat(String(el.querySelector('.preco')?.value || '0').replace(',', '.')) || 0;
    const obs = el.querySelector('.obsItem')?.value || '';
    // pega do atributo; se não vier e for UN, calcula pelo nome
    let pesoTotalKg = parseFloat(String(el.getAttribute('data-peso-total-kg') || '0').replace(',', '.')) || 0;
    if (!pesoTotalKg && tipo === 'UN') {
      const kgUn = parsePesoFromProduto(produto);
      if (kgUn) pesoTotalKg = quantidade * kgUn;
    }

    let total = quantidade * preco;
    if (tipo === 'UN' && pesoTotalKg > 0) total = pesoTotalKg * preco;

    out.push({ produto, tipo, quantidade, preco, obs, total, _pesoTotalKg: pesoTotalKg });
  });
  return out.length ? out : [{ produto: '', tipo: 'KG', quantidade: 0, preco: 0, obs: '', total: 0 }];
}

/* ===================== Desenho do PDF ====================== */

function drawCenteredKeyValueBox(doc, x, y, w, label, value, opts = {}) {
  const { rowH = 12, titleSize = 7, valueSize = 7 } = opts;
  doc.setDrawColor(0); doc.setLineWidth(0.2);
  doc.rect(x, y, w, rowH, "S");
  const ltxt = String(label || "").toUpperCase();
  const vtxt = String(value || "").toUpperCase();
  const baseY = y + rowH / 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(titleSize);
  doc.text(ltxt, x + w / 2, baseY - 2.2, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(valueSize);
  doc.text(vtxt, x + w / 2, baseY + 3.2, { align: "center" });
  return rowH;
}
function drawKeyValueBox(doc, x, y, w, label, value, opts = {}) {
  const { rowH = 10, titleSize = 7, valueSize = 7 } = opts;
  doc.setDrawColor(0); doc.setLineWidth(0.2);
  doc.rect(x, y, w, rowH, "S");
  const yBase = y + rowH / 2 + 0.5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(titleSize);
  const ltxt = (String(label || "").toUpperCase() + ": ");
  const lW = doc.getTextWidth(ltxt);
  doc.text(ltxt, x + 3, yBase);
  doc.setFont("helvetica", "normal"); doc.setFontSize(valueSize);
  doc.text(String(value || "").toUpperCase(), x + 3 + lW, yBase);
  return rowH;
}

/* ================== Montagem e Geração ===================== */

export async function montarPDF() {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [72, 297] });

  // Cabeçalho solicitado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("PEDIDO SERRA NOBRE", 36, 7, { align: "center" });

  const margemX = 2, larguraCaixa = 68;
  const W_PROD = 23.5, W_QDE = 13, W_UNIT = 13, W_TOTAL = 18.5;
  const SAFE_BOTTOM = 287;
  let y = 10;

  function ensureSpace(h) {
    if (y + h > SAFE_BOTTOM) { doc.addPage([72, 297], "portrait"); y = 10; }
  }

  // Coleta de campos da UI
  const cliente = document.getElementById("cliente").value.trim().toUpperCase();
  const endereco = document.getElementById("endereco").value.trim().toUpperCase();
  const entregaISO = document.getElementById("entrega").value;
  const hora = document.getElementById("horaEntrega").value;
  const cnpj = digitsOnly(document.getElementById("cnpj").value);
  const ie = (document.getElementById("ie").value || "").toUpperCase();
  const cep = digitsOnly(document.getElementById("cep").value);
  const contato = digitsOnly(document.getElementById("contato").value);
  const pagamento = document.getElementById("pagamento").value;
  const obsG = (document.getElementById("obsGeral").value || "").trim().toUpperCase();
  const tipoEnt = document.querySelector('input[name="tipoEntrega"]:checked')?.value || "ENTREGA";

  // ===== CLIENTE
  ensureSpace(14);
  y += drawKeyValueBox(doc, margemX, y, larguraCaixa, "CLIENTE", cliente, { rowH: 12, titleSize: 8, valueSize: 8 }) + 1;

  // ===== CNPJ / IE
  const gap1 = 1;
  const halfW = (larguraCaixa - gap1) / 2;
  ensureSpace(12);
  drawCenteredKeyValueBox(doc, margemX, y, halfW, "CNPJ", cnpj, { rowH: 10, titleSize: 7, valueSize: 8 });
  drawCenteredKeyValueBox(doc, margemX + halfW + gap1, y, halfW, "I.E.", ie, { rowH: 10, titleSize: 7, valueSize: 8 });
  y += 11;

  // ===== ENDEREÇO – com quebra automática dentro da moldura
  const pad = 3;
  const innerW = larguraCaixa - pad * 2;
  const linhasEnd = splitToWidth(doc, endereco, innerW);
  const rowH = Math.max(12, 6 + linhasEnd.length * 5 + 4);
  ensureSpace(rowH);
  doc.setDrawColor(0); doc.setLineWidth(0.2);
  doc.rect(margemX, y, larguraCaixa, rowH, "S");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("ENDEREÇO", margemX + pad, y + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  const baseY = y + 9;
  linhasEnd.forEach((ln, i) => doc.text(ln, margemX + pad, baseY + i * 5));
  y += rowH + 1;

  // ===== CONTATO / CEP
  ensureSpace(12);
  drawCenteredKeyValueBox(doc, margemX, y, halfW, "CONTATO", contato, { rowH: 10, titleSize: 7, valueSize: 8 });
  drawCenteredKeyValueBox(doc, margemX + halfW + gap1, y, halfW, "CEP", cep, { rowH: 10, titleSize: 7, valueSize: 8 });
  y += 11;

  // ===== DIA / DATA / HORA
  ensureSpace(12);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("DIA DA SEMANA:", margemX + 3, y + 6);
  doc.text(diaDaSemanaExtenso(entregaISO), margemX + larguraCaixa / 2 + 12, y + 6, { align: "center" });
  y += 11;

  const halfW2 = (larguraCaixa - 1) / 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.rect(margemX, y, halfW2, 10, "S");
  doc.rect(margemX + halfW2 + 1, y, halfW2, 10, "S");
  doc.text("DATA ENTREGA", margemX + halfW2 / 2, y + 4, { align: "center" });
  doc.text("HORÁRIO ENTREGA", margemX + halfW2 + 1 + halfW2 / 2, y + 4, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(formatarData(entregaISO), margemX + halfW2 / 2, y + 8, { align: "center" });
  doc.text(hora, margemX + halfW2 + 1 + halfW2 / 2, y + 8, { align: "center" });
  y += 12;

  // ===== ITENS (tabela)
  ensureSpace(14);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.rect(margemX, y, W_PROD, 10, "S");
  doc.rect(margemX + W_PROD, y, W_QDE, 10, "S");
  doc.rect(margemX + W_PROD + W_QDE, y, W_UNIT, 10, "S");
  doc.rect(margemX + W_PROD + W_QDE + W_UNIT, y, W_TOTAL, 10, "S");
  doc.text("PRODUTO", margemX + W_PROD / 2, y + 6, { align: "center" });
  doc.text("QDE", margemX + W_PROD + W_QDE / 2, y + 6, { align: "center" });
  doc.text("R$ UNIT.", margemX + W_PROD + W_QDE + W_UNIT / 2, y + 6, { align: "center" });
  const valorX = margemX + W_PROD + W_QDE + W_UNIT + W_TOTAL / 2;
  doc.text("VALOR", valorX, y + 4, { align: "center" });
  doc.text("PRODUTO", valorX, y + 8.5, { align: "center" });
  y += 12;

  const itens = lerItensDaTela();
  let subtotal = 0;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);

  itens.forEach((it, idx) => {
    const prod = it.produto || "";
    const qtdStr = String(it.quantidade || 0);
    const tipo = it.tipo || "KG";
    const precoNum = parseFloat(String(it.preco).replace(',', '.')) || 0;

    // Se for UN com peso, total = pesoTotal * preco(kg); senão = quantidade * preco
    const pesoTotalKg = Number(it._pesoTotalKg || 0);
    const totalNum = (tipo === 'UN' && pesoTotalKg > 0)
      ? (pesoTotalKg * precoNum)
      : ((Number(it.quantidade || 0) * precoNum));

    const prodLines = splitToWidth(doc, prod, W_PROD - 2).slice(0, 3);
    const rowHi = Math.max(14, 6 + prodLines.length * 5);
    ensureSpace(rowHi + (tipo === 'UN' && pesoTotalKg ? 6 : 0));

    // células
    doc.rect(margemX, y, W_PROD, rowHi, "S");
    doc.rect(margemX + W_PROD, y, W_QDE, rowHi, "S");
    doc.rect(margemX + W_PROD + W_QDE, y, W_UNIT, rowHi, "S");
    doc.rect(margemX + W_PROD + W_QDE + W_UNIT, y, W_TOTAL, rowHi, "S");

    // centralizadores
    const center = (cx, lines) => {
      const block = (lines.length - 1) * 5;
      const base = y + (rowHi - block) / 2;
      lines.forEach((ln, k) => doc.text(ln, cx, base + k * 5, { align: "center" }));
    };
    center(margemX + W_PROD / 2, prodLines);
    center(margemX + W_PROD + W_QDE / 2, qtdStr ? [qtdStr, tipo] : [""]);
    if (tipo === 'UN' && pesoTotalKg) {
      center(margemX + W_PROD + W_QDE + W_UNIT / 2,
        precoNum ? ["R$/KG", precoNum.toFixed(2).replace(".", ",")] : ["—"]);
    } else {
      center(margemX + W_PROD + W_QDE + W_UNIT / 2,
        precoNum ? ["R$", precoNum.toFixed(2).replace(".", ",")] : ["—"]);
    }
    center(margemX + W_PROD + W_QDE + W_UNIT + W_TOTAL / 2,
      (precoNum && (it.quantidade || pesoTotalKg)) ? ["R$", totalNum.toFixed(2).replace(".", ",")] : ["—"]);

    y += rowHi;

    if (tipo === 'UN' && pesoTotalKg) {
      doc.setFontSize(7); doc.setFont("helvetica", "italic");
      doc.text(`(*) Peso total: ${pesoTotalKg.toFixed(3)} kg`, margemX + 3, y + 4);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      y += 5;
    }

    const obs = (it.obs || "").trim();
    if (obs) {
      const corpoLines = splitToWidth(doc, obs.toUpperCase(), larguraCaixa - 6);
      const obsH = 9 + corpoLines.length * 5;
      ensureSpace(obsH);
      doc.rect(margemX, y, larguraCaixa, obsH, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      const titulo = "OBSERVAÇÕES:"; const tx = margemX + 3, ty = y + 6;
      doc.text(titulo, tx, ty); doc.line(tx, ty + 0.8, tx + doc.getTextWidth(titulo), ty + 0.8);
      doc.setFont("helvetica", "normal");
      let baseY2 = y + 12; corpoLines.forEach((ln, ix) => doc.text(ln, margemX + 3, baseY2 + ix * 5));
      y += obsH;
    }

    subtotal += totalNum;
    if (idx < itens.length - 1) y += 2;
  });

  // ===== SOMA PRODUTOS
  const w2tercos = Math.round(larguraCaixa * (2 / 3));
  const somaX = margemX + larguraCaixa - w2tercos;
  ensureSpace(11);
  drawKeyValueBox(doc, somaX, y, w2tercos, "SOMA PRODUTOS", "R$ " + subtotal.toFixed(2),
    { rowH: 10, titleSize: 7, valueSize: 7 });
  y += 12;

  // ===== ENTREGA/RETIRADA + FRETE
  const gap2 = 2;
  const entregaW = Math.round(larguraCaixa * (2 / 3));
  const freteW = larguraCaixa - entregaW - gap2;
  ensureSpace(12);
  doc.setLineWidth(1.1);

  // ENTREGA/RETIRADA
  doc.rect(margemX, y, entregaW, 10, "S");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(tipoEnt, margemX + entregaW / 2, y + 6.5, { align: "center" });

  // FRETE
  const freteX = margemX + entregaW + gap2;
  const frete = getFreteAtual() || { valorBase: 0, isento: false };
  const isentoMan = !!document.getElementById('isentarFrete')?.checked;
  doc.rect(freteX, y, freteW, 10, "S");
  doc.text("FRETE", freteX + freteW / 2, y + 4, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const fretePreview = (isentoMan || frete.isento) ? "ISENTO" : ("R$ " + Number(frete.valorBase || 0).toFixed(2));
  doc.text(fretePreview, freteX + freteW / 2, y + 8.2, { align: "center" });
  doc.setLineWidth(0.2);
  y += 12;

  // ===== TOTAL
  const freteCobravelParaTotal = (isentoMan ? 0 : Number(frete.valorCobravel || 0));
  const totalGeral = subtotal + freteCobravelParaTotal;
  ensureSpace(11);
  const rowHtotal = 10;
  doc.rect(margemX, y, larguraCaixa, rowHtotal, "S");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("TOTAL DO PEDIDO:", margemX + 3, y + rowHtotal / 2 + 0.5);
  doc.text("R$ " + totalGeral.toFixed(2), margemX + larguraCaixa - 3, y + rowHtotal / 2 + 0.5, { align: "right" });
  y += rowHtotal + 2;

  if (obsG) {
    const corpoLines = splitToWidth(doc, obsG.toUpperCase(), larguraCaixa - 6);
    const h = 9 + corpoLines.length * 5;
    ensureSpace(h + 2);
    doc.rect(margemX, y, larguraCaixa, h, "S");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    const titulo = "OBSERVAÇÃO DO PEDIDO:"; const tx = margemX + 3, ty = y + 6;
    doc.text(titulo, tx, ty); doc.line(tx, ty + 0.8, tx + doc.getTextWidth(titulo), ty + 0.8);
    doc.setFont("helvetica", "normal");
    let baseY3 = y + 12; corpoLines.forEach((ln, ix) => doc.text(ln, margemX + 3, baseY3 + ix * 5));
    y += h + 3;
  }

  // Nome do arquivo no formato solicitado
  const nomeArquivo = nomeArquivoPedido(cliente, entregaISO, hora);
  return { doc, nomeArquivo };
}

/* ================ Ação: gerarPDF (abrir/salvar) ================= */

async function abrirPDFComFallback(doc, nomeArquivo, baixarSeBloquear = false) {
  try {
    const url = doc.output('bloburl');
    const win = window.open(url, '_blank');
    if (win) return;
    const blob = await doc.output('blob');
    const a = document.createElement('a');
    const objURL = URL.createObjectURL(blob);
    a.href = objURL; a.download = nomeArquivo || 'pedido.pdf';
    if (baixarSeBloquear) {
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objURL), 20000);
      return;
    }
    doc.save(nomeArquivo || 'pedido.pdf');
  } catch (_) {
    doc.save(nomeArquivo || 'pedido.pdf');
  }
}

export async function gerarPDF(apenasSalvar = false, btnEl) {
  const originalTxt = btnEl && btnEl.textContent;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Gerando...'; }

  try {
    await ensureFreteBeforePDF();
    const { doc, nomeArquivo } = await montarPDF();
    if (apenasSalvar) doc.save(nomeArquivo);
    else await abrirPDFComFallback(doc, nomeArquivo, true);
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = originalTxt || 'Gerar PDF'; }
  }
}