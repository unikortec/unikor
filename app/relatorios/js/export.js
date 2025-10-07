// relatorios/js/export.js
// Gera PDF em PAISAGEM, com cabeçalho do cliente, header cinza e linhas zebrada.
// Evita consultas – usa apenas o array já carregado (rows).

const { jsPDF } = window.jspdf || {};

// ===== Helpers numéricos =====
const moneyBR = (n) => (Number(n||0)).toFixed(2).replace(".", ",");
function parseBRNumber(val){
  if (typeof val === "number") return val;
  const s = String(val ?? "").trim().replace(/\s+/g,"").replace(/\./g,"").replace(",",".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

// ===== Regras de cálculo iguais às da listagem/modal =====
function kgPorUnFromDesc(desc=""){
  const s = String(desc).toLowerCase().replace(',', '.').replace(/\s+/g,' ');
  const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b\.?/g;
  let m,last=null; while((m=re.exec(s))!==null) last=m;
  if (!last) return 0;
  const raw = String(last[1]).replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'');
  const val = parseFloat(raw); if (!isFinite(val)||val<=0) return 0;
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
const toBRDate = (iso)=> (iso ? iso.split("-").reverse().join("/") : "");

// ===== Geração =====
export function exportarPDF(rows = []){
  if (!jsPDF){ alert("Biblioteca PDF não carregada."); return; }

  // A4 paisagem
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  let y = margin;

  // Paleta
  const DARK = 60;        // cinza escuro
  const ROW1 = 245;       // zebra 1 (quase branco)
  const ROW2 = 232;       // zebra 2 (cinza clarinho)

  // Tipografia
  const setBold = (sz)=>{ doc.setFont("helvetica","bold"); doc.setFontSize(sz); };
  const setReg  = (sz)=>{ doc.setFont("helvetica","normal"); doc.setFontSize(sz); };

  // Cabeçalho do relatório
  setBold(12);
  doc.text("RELATÓRIO DE PEDIDOS", margin, y); setReg(9);
  const totalGeral = rows.reduce((s,r)=> s + (Array.isArray(r.itens) ? r.itens.reduce((a,it)=>a+subtotalItem(it),0) : 0), 0);
  doc.text(`Total de pedidos: ${rows.length}  •  Soma dos produtos: R$ ${moneyBR(totalGeral)}`, margin, y+6);
  y += 12;

  // Agrupar por cliente para gerar cabeçalhos por cliente
  const byCliente = new Map();
  rows.forEach(r=>{
    const key = (r.cliente||"—").toString().toUpperCase();
    if (!byCliente.has(key)) byCliente.set(key, []);
    byCliente.get(key).push(r);
  });

  // Tabela: larguras
  const col = {
    data: 24,
    hora: 16,
    prod: Math.max(80, pageW - margin*2 - (24+16+20+28+22+22)), // ajusta automático
    qtd:  20,
    un:   22,
    val:  22,
    sub:  22
  };

  function ensureSpace(h){
    if (y + h > pageH - margin){
      doc.addPage();
      y = margin;
    }
  }
  function linhaForteCinza(x1,y1,x2){
    doc.setDrawColor(DARK); doc.setLineWidth(1.2);
    doc.line(x1, y1, x2, y1);
    doc.setLineWidth(0.2); // volta
  }
  function headerCliente(nome){
    ensureSpace(12);
    setBold(11);
    doc.text(nome, margin, y+6);
    // linha inferior cinza escuro (sem fundo)
    linhaForteCinza(margin, y+8.5, pageW - margin);
    y += 10;
  }
  function headerTabela(){
    ensureSpace(10);
    // barra cinza escura no fundo do cabeçalho
    doc.setFillColor(DARK,DARK,DARK);
    doc.rect(margin, y, pageW - margin*2, 8, "F");
    setBold(8); doc.setTextColor(255,255,255);
    let x = margin + 2;
    doc.text("DATA", x, y+5); x += col.data;
    doc.text("HORA", x, y+5); x += col.hora;
    doc.text("PRODUTO", x, y+5); x += col.prod;
    doc.text("QTD", x, y+5); x += col.qtd;
    doc.text("UN", x, y+5); x += col.un;
    doc.text("R$ UNIT.", x, y+5); x += col.val;
    doc.text("SUBTOTAL", x, y+5);
    doc.setTextColor(0,0,0);
    y += 9;
  }
  function rowItem(i, it, r){
    const zebra = (i % 2 === 0) ? ROW1 : ROW2;
    const h = 7; ensureSpace(h);
    doc.setFillColor(zebra,zebra,zebra);
    doc.rect(margin, y, pageW - margin*2, h, "F");

    setReg(8);
    const desc = String(it.descricao || it.produto || "").toUpperCase();
    const qtd  = Number(it.qtd ?? it.quantidade ?? 0);
    const un   = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
    const pu   = Number(it.precoUnit ?? it.preco ?? 0);
    const sub  = (typeof it.subtotal === "number") ? Number(it.subtotal) : subtotalItem(it);

    let x = margin + 2;
    doc.text(toBRDate(r.dataEntregaISO||""), x, y+4); x += col.data;
    doc.text(String(r.horaEntrega||""), x, y+4); x += col.hora;

    const maxW = col.prod - 2;
    const lines = doc.splitTextToSize(desc, maxW);
    doc.text(lines[0] || "", x, y+4);
    x += col.prod;

    doc.text(String(qtd), x, y+4); x += col.qtd;
    doc.text(un, x, y+4); x += col.un;
    doc.text(moneyBR(pu), x, y+4, { align:"right" }); x += col.val;
    doc.text(moneyBR(sub), x, y+4, { align:"right" });

    y += h;
  }
  function footerCliente(totalCliente){
    ensureSpace(10);
    setBold(9);
    doc.text("SOMA DOS PRODUTOS DO CLIENTE:", pageW - margin - 90, y+5);
    doc.text(`R$ ${moneyBR(totalCliente)}`, pageW - margin, y+5, { align:"right" });
    y += 8;
  }

  // ===== Render =====
  for (const [cliente, pedidos] of byCliente.entries()){
    headerCliente(cliente);
    headerTabela();

    let somaCliente = 0;
    // cada pedido → suas linhas de itens
    pedidos.forEach((r)=>{
      const itens = Array.isArray(r.itens) ? r.itens : [];
      itens.forEach((it, idx)=>{ somaCliente += subtotalItem(it); rowItem(idx, it, r); });
    });

    footerCliente(somaCliente);
    // espaço entre clientes
    y += 2;
  }

  // Final
  doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
}

// Mantém compatibilidade com app.js atual
export function exportarXLSX(rows=[]){
  alert("XLSX não alterado aqui. (continua usando a versão anterior)");
}