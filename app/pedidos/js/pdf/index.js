// /app/pedidos/js/pdf/index.js
import { ensureFreteBeforePDF, getFreteAtual } from '../frete.js';
import { db, getTenantId, doc, getDoc } from '../firebase.js';
import {
  digitsOnly, strToCents, strToThousandths, nomeArquivoPedido, formatarData
} from './helpers.js';
import { construirPDFBase } from './base.js';

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
      const sel = document.getElementById("pagamento") || document.getElementById("formaPagamento");
      const outro = document.getElementById("pagamentoOutro") || document.getElementById("pagamento_outro");
      let p = (sel?.value || "").trim().toUpperCase();
      if (p === "OUTRO") {
        const o = (outro?.value || "").trim();
        if (o) p = o.toUpperCase();
      }
      return p || "NÃO INFORMADO";
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

        const qtdTxt = (quantidadeInput?.value ?? '').trim();
        const precoTxt = (precoInput?.value ?? '').trim();

        const qtdMil = strToThousandths(qtdTxt);
        const precoCents = strToCents(precoTxt);

        // Peso total para UN quando nome contém peso
        let pesoTotalKgMil = 0;
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

        let totalCents = 0;
        if (tipo === 'UN' && pesoTotalKgMil > 0) {
          totalCents = Math.round((pesoTotalKgMil * precoCents) / 1000);
        } else {
          if (tipo === 'KG') totalCents = Math.round((qtdMil * precoCents) / 1000);
          else {
            const qtdInt = Math.round(Number(qtdTxt.replace(',','.') || 0));
            totalCents = qtdInt * precoCents;
          }
        }

        const obs = obsInput?.value?.trim() || '';
        return { produto, tipo, qtdTxt, precoTxt, qtdMil, precoCents, totalCents, obs, _pesoTotalKgMil: pesoTotalKgMil };
      });
    })()
  };

  const frete = getFreteAtual() || { valorBase:0, valorCobravel:0, isento:false };
  const isentoMan = !!document.getElementById('isentarFrete')?.checked;

  return construirPDFBase({
    ...form,
    freteLabel: (isentoMan || frete.isento) ? "ISENTO" : ("R$ " + Number(frete.valorBase||0).toFixed(2)),
    freteCobravel: (isentoMan ? 0 : Number(frete.valorCobravel||frete.valorBase||0)),
  });
}

// Reimpressão
function normalizarPedidoSalvo(p){
  const itens = Array.isArray(p?.itens) ? p.itens.map(it=>{
    const tipo = String(it.tipo||'KG').toUpperCase();
    const precoCents = Math.round(Number(it.precoUnit ?? it.preco ?? 0) * 100);
    const qtdTxt = String(it.quantidade ?? 0);
    const qtdMil = Math.round(Number(it.quantidade ?? 0) * 1000);
    let totalCents = Math.round(Number(it.total ?? 0) * 100);
    if (!totalCents){
      totalCents = (tipo === 'KG') ? Math.round((qtdMil * precoCents) / 1000)
                                   : Math.round((Number(qtdTxt) || 0) * precoCents);
    }
    return {
      produto: String(it.produto||'').trim(),
      tipo, qtdTxt, precoTxt: (Number(precoCents)/100).toFixed(2).replace('.', ','),
      qtdMil, precoCents, totalCents, obs: String(it.obs||'').trim(),
      _pesoTotalKgMil: 0
    };
  }) : [];

  return {
    cliente: String(p?.cliente||p?.clienteUpper||'').toUpperCase(),
    endereco: String(p?.entrega?.endereco || p?.endereco || '').toUpperCase(),
    entregaISO: p?.dataEntregaISO || '',
    hora: p?.horaEntrega || '',
    cnpj: digitsOnly(p?.clienteFiscal?.cnpj || ''),
    ie: String(p?.clienteFiscal?.ie || '').toUpperCase(),
    cep: digitsOnly(p?.clienteFiscal?.cep || ''),
    contato: digitsOnly(p?.clienteFiscal?.contato || ''),
    obsGeralTxt: String(p?.obs || p?.obsGeral || '').toUpperCase(),
    tipoEnt: String(p?.entrega?.tipo || 'ENTREGA').toUpperCase(),
    pagamento: String(p?.pagamento || 'NÃO INFORMADO').toUpperCase(),
    itens,
    freteLabel: (p?.frete?.isento ? "ISENTO" : ("R$ " + Number(p?.frete?.valorBase||0).toFixed(2))),
    freteCobravel: Number(p?.frete?.valorCobravel ?? p?.frete?.valorBase ?? 0)
  };
}
async function construirPDFDePedidoSalvo(docData){
  return construirPDFBase(normalizarPedidoSalvo(docData));
}

/* ========= APIs públicas: preview/salvar/share ========= */
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
  const link = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = link; a.download = nomeArq;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(link), 10000);
  return { nome: nomeArq };
}

/* ======== Compartilhamento nativo (ANEXO c/ nome + texto “Nome cliente data entrega”) ======== */
function isIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent); }

function montarTextoCompartilhamento(nomeArq){
  const cliente = (document.getElementById('cliente')?.value || '').trim();
  const entregaISO = document.getElementById('entrega')?.value || '';
  if (cliente && entregaISO){
    return `Pedido ${cliente} ${formatarData(entregaISO)}`;
  }
  // fallback se não houver campos no DOM
  return `Pedido ${nomeArq}`;
}

export async function compartilharComBlob(blob, nomeArq='pedido.pdf'){
  const file = new File([blob], nomeArq, { type:'application/pdf', lastModified:Date.now() });
  const text = montarTextoCompartilhamento(nomeArq);

  const level2 = !!(navigator && 'share' in navigator && 'canShare' in navigator);
  if (level2 && navigator.canShare({ files:[file] })) {
    try {
      // iOS costuma exigir algum texto para exibir o WhatsApp no share sheet
      const shareData = { files:[file], title:nomeArq, text };
      await navigator.share(shareData);
      return { compartilhado:true };
    } catch (e) {
      if (String(e?.name||e).includes('AbortError')) {
        return { compartilhado:false, cancelado:true };
      }
      // continua para fallback
    }
  }

  // Fallback visualizador (Quick Look no iOS / visor no Android/PC)
  try{
    const url = URL.createObjectURL(blob);
    if (isIOS()) window.location.assign(url);
    else window.open(url,'_blank','noopener,noreferrer');
    setTimeout(()=>URL.revokeObjectURL(url),15000);
    return { compartilhado:false, fallback:true };
  }catch{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=nomeArq;
    document.body.appendChild(a); a.click(); a.remove();
    return { compartilhado:false, fallback:true, download:true };
  }
}

export async function compartilharPDFNativo(){
  const { blob, nomeArq } = await construirPDF();
  return compartilharComBlob(blob, nomeArq);
}

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
// útil p/ fila
export { construirPDFBase as __construirPDFBasePublic };