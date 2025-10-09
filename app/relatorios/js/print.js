// relatorios/js/print.js
import { db, getTenantId, doc, getDoc } from "./firebase.js";

// importa o miolo de desenho do app Pedidos (sem duplicar código)
async function loadPDFCore(){
  // caminho relativo ao site; ajuste se sua pasta for diferente
  const pdf = await import("/app/pedidos/js/pdf.js");
  if (!pdf.__construirPDFBasePublic) throw new Error("PDF core indisponível");
  return pdf.__construirPDFBasePublic;
}

/* --- normalização igual usamos no app Pedidos --- */
function digitsOnly(v){ return String(v||"").replace(/\D/g,""); }

function normalizarPedidoSalvo(p){
  const itens = Array.isArray(p.itens) ? p.itens.map(it=>{
    const produto = String(it.produto||"").trim();
    const tipo = String(it.tipo||"KG").toUpperCase();
    const precoCents = Math.round(Number(it.precoUnit ?? it.preco ?? 0) * 100);
    const qtdTxt = String(it.quantidade ?? 0);
    const qtdMil = Math.round(Number(it.quantidade ?? 0) * 1000);
    let totalCents = Math.round(Number(it.total ?? 0) * 100);
    if (!totalCents){
      if (tipo === "KG") totalCents = Math.round((qtdMil * precoCents) / 1000);
      else               totalCents = Math.round((Number(qtdTxt) || 0) * precoCents);
    }
    return {
      produto, tipo,
      qtdTxt, precoTxt: (Number(precoCents)/100).toFixed(2).replace(".", ","),
      qtdMil, precoCents, totalCents,
      obs: String(it.obs||"").trim(),
      _pesoTotalKgMil: 0
    };
  }) : [];

  return {
    cliente: String(p.cliente||p.clienteUpper||"").toUpperCase(),
    endereco: String(p.entrega?.endereco || p.endereco || "").toUpperCase(),
    entregaISO: p.dataEntregaISO || "",
    hora: p.horaEntrega || "",
    cnpj: digitsOnly(p.clienteFiscal?.cnpj || ""),
    ie: String(p.clienteFiscal?.ie || "").toUpperCase(),
    cep: digitsOnly(p.clienteFiscal?.cep || ""),
    contato: digitsOnly(p.clienteFiscal?.contato || ""),
    obsGeralTxt: String(p.obs || p.obsGeral || "").toUpperCase(),
    tipoEnt: String(p.entrega?.tipo || "ENTREGA").toUpperCase(),
    pagamento: String(p.pagamento || "").toUpperCase(),
    itens,
    freteLabel: (p.frete?.isento ? "ISENTO" : ("R$ " + Number(p.frete?.valorBase||0).toFixed(2))),
    freteCobravel: Number(p.frete?.valorCobravel ?? p.frete?.valorBase ?? 0)
  };
}

/* ========== imprimir do Firestore (lista) ========== */
export async function printPedido80mm(pedidoId){
  const tenantId = await getTenantId();
  const ref = doc(db, "tenants", tenantId, "pedidos", pedidoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) { alert("Pedido não encontrado."); return; }

  const core = await loadPDFCore();
  const data = normalizarPedidoSalvo(snap.data() || {});
  const { blob } = core(data);

  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
}

// deixa disponível p/ app.js usar pela janela (delegate)
window.printPedido80mm = printPedido80mm;

/* ========== imprimir a partir do MODAL (sem salvar) ========== */
// `modalState` deve vir do seu modal.js (campos básicos + itens)
export async function printFromModal(modalState){
  // modalState: { cliente, endereco, dataEntregaISO, horaEntrega, pagamento, obsGeral, entrega:{tipo}, frete:{isento,valorBase,valorCobravel}, itens:[{produto,tipo,quantidade,precoUnit,obs}] }
  const core = await loadPDFCore();

  const itens = (modalState.itens || []).map(it=>{
    const precoCents = Math.round(Number(it.precoUnit || it.preco || 0) * 100);
    const qtdTxt = String(it.quantidade ?? 0);
    const qtdMil = Math.round(Number(it.quantidade ?? 0) * 1000);
    const tipo = String(it.tipo||"KG").toUpperCase();
    let totalCents = Math.round(Number(it.total || 0) * 100);
    if (!totalCents){
      if (tipo === "KG") totalCents = Math.round((qtdMil * precoCents) / 1000);
      else               totalCents = Math.round((Number(qtdTxt)||0) * precoCents);
    }
    return {
      produto:String(it.produto||"").trim(),
      tipo,
      qtdTxt,
      precoTxt: (Number(precoCents)/100).toFixed(2).replace(".", ","),
      qtdMil, precoCents, totalCents,
      obs:String(it.obs||"").trim(),
      _pesoTotalKgMil:0
    };
  });

  const data = {
    cliente: String(modalState.cliente||"").toUpperCase(),
    endereco: String(modalState.endereco||"").toUpperCase(),
    entregaISO: modalState.dataEntregaISO || "",
    hora: modalState.horaEntrega || "",
    cnpj: digitsOnly(modalState?.clienteFiscal?.cnpj || ""),
    ie: String(modalState?.clienteFiscal?.ie || "").toUpperCase(),
    cep: digitsOnly(modalState?.clienteFiscal?.cep || ""),
    contato: digitsOnly(modalState?.clienteFiscal?.contato || ""),
    obsGeralTxt: String(modalState.obsGeral || modalState.obs || "").toUpperCase(),
    tipoEnt: String(modalState?.entrega?.tipo || "ENTREGA").toUpperCase(),
    pagamento: String(modalState.pagamento || "").toUpperCase(),
    itens,
    freteLabel: (modalState?.frete?.isento ? "ISENTO" : ("R$ " + Number(modalState?.frete?.valorBase||0).toFixed(2))),
    freteCobravel: Number(modalState?.frete?.valorCobravel ?? modalState?.frete?.valorBase ?? 0)
  };

  const { blob } = core(data);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
}