// app/pedidos/js/frete.js
// ⇨ Sempre usa /api/... (raiz). Nada de /app/api/...
const API_BASE = ""; // same-origin
export const ABS_FRETE_BASE = location.origin; // fallback absoluto same-origin

// Estado interno (último frete calculado e sugestão vinda do cliente)
const freteCtrl = { ultimo: null, sugestao: null };

// Utils
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function appendPOA(str){
  const t = String(str||"").trim();
  if (!t) return t;
  if (/porto\s*alegre/i.test(t)) return t;
  const TEM_CIDADE = /,\s*([A-Za-zÀ-ÿ'.\-\s]{2,})(?:\s*-\s*[A-Za-z]{2})?/i;
  if (TEM_CIDADE.test(t)) return t;
  return `${t}, Porto Alegre - RS`;
}

// ---- chamada HTTP para o serviço de frete ----
export async function calcularFrete(enderecoTexto, subtotal){
  if (!enderecoTexto) {
    return { valorBase:0, valorCobravel:0, isento:false, labelIsencao:"", _vazio:true };
  }
  
  const isentar = !!document.getElementById('isentarFrete')?.checked;
  
  // 🔥 PRIORIDADE 1: Se tem frete manual digitado (campo de entrada manual)
  const freteManualInput = document.getElementById('freteManual');
  if (freteManualInput && freteManualInput.value.trim()) {
    const valorManual = parseFloat(freteManualInput.value.replace(',', '.')) || 0;
    return { 
      valorBase: valorManual, 
      valorCobravel: isentar ? 0 : valorManual, 
      isento: isentar, 
      labelIsencao: isentar ? "(ISENTO manual)" : "(manual)", 
      _manual: true 
    };
  }
  
  // 🔥 PRIORIDADE 2: Se tem sugestão do cadastro do cliente
  if (freteCtrl.sugestao && typeof freteCtrl.sugestao === 'number') {
    const valorCadastro = freteCtrl.sugestao;
    return { 
      valorBase: valorCadastro, 
      valorCobravel: isentar ? 0 : valorCadastro, 
      isento: isentar, 
      labelIsencao: isentar ? "(ISENTO)" : "(do cadastro)", 
      _cadastro: true 
    };
  }
  
  // 🔥 PRIORIDADE 3: Calcular pela API com distância
  const payload = { enderecoTexto, totalItens: subtotal, clienteIsento: isentar };
  
  // 1) endpoint principal (raiz)
  try{
    const r = await fetch(`${API_BASE}/api/calcular-entrega`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    if(!r.ok) throw new Error("HTTP "+r.status);
    return await r.json();
  }catch(_){}
  
  // 2) fallback absoluto same-origin
  try{
    const r2 = await fetch(`${ABS_FRETE_BASE}/api/calcular-entrega`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    if(!r2.ok) throw new Error("HTTP "+r2.status);
    return await r2.json();
  }catch(_){
    return { valorBase:0, valorCobravel:0, isento:false, labelIsencao:"(falha no cálculo)", _err:true };
  }
}

// ---- Atualização do rótulo de frete (com debounce para digitação) ----
export const atualizarFreteUI = debounce(async function(){
  const out = document.getElementById("freteValor");
  if (!out) return;
  
  let end = document.getElementById("endereco")?.value?.trim()?.toUpperCase() || "";
  end = appendPOA(end);
  
  // soma usando DOM dos itens renderizados
  const totais = Array.from(document.querySelectorAll("[id^='totalItem_']"))
    .map(el => parseFloat(String(el.textContent||"0").replace(",", ".")) || 0);
  const subtotal = totais.reduce((s,v)=>s+(v||0),0);
  
  const resp = await calcularFrete(end, subtotal);
  freteCtrl.ultimo = resp;
  
  const isManual = !!document.getElementById('isentarFrete')?.checked;
  let rotulo = "";
  
  if (resp._manual) rotulo = "(manual)";
  else if (resp._cadastro) rotulo = "(do cadastro)";
  else if (isManual) rotulo = "(ISENTO manual)";
  else if (resp?.labelIsencao) rotulo = resp.labelIsencao;
  else if (resp?._err) rotulo = "(falha no cálculo)";
  
  out.textContent = resp?.valorBase==null ? "—" : `R$ ${Number(resp.valorBase||0).toFixed(2)} ${rotulo}`;
}, 300);

// ---- Sem debounce: garante frete calculado antes do PDF ----
export async function ensureFreteBeforePDF(){
  const out = document.getElementById("freteValor");
  let end = document.getElementById("endereco")?.value?.trim()?.toUpperCase() || "";
  end = appendPOA(end);
  
  // Subtotal preciso baseado nos inputs dos itens
  const itensEls = Array.from(document.querySelectorAll(".item"));
  let subtotal = 0;
  if (itensEls.length){
    itensEls.forEach((el)=>{
      const q = parseFloat(el.querySelector(".quantidade")?.value || "0") || 0;
      const p = parseFloat(el.querySelector(".preco")?.value || "0") || 0;
      const tipo = (el.querySelector(".tipo-select")?.value || "KG").toUpperCase();
      const prod = (el.querySelector(".produto")?.value || "").toLowerCase();
      const m = /(\d+(?:[.,]\d+)?)[\s]*(kg|quilo|quilos|g|gr|grama|gramas)\b/.exec(prod);
      if (tipo === "UN" && m){
        const val = parseFloat((m[1]||"").replace(",", ".")) || 0;
        const kgUn = (m[2] === "kg" || m[2].startsWith("quilo")) ? val : val/1000;
        subtotal += (q * kgUn) * p;
      } else {
        subtotal += q * p;
      }
    });
  }
  
  const resp = await calcularFrete(end, subtotal);
  freteCtrl.ultimo = resp;
  
  if (out){
    const isManual = !!document.getElementById('isentarFrete')?.checked;
    let rotulo = "";
    
    if (resp._manual) rotulo = "(manual)";
    else if (resp._cadastro) rotulo = "(do cadastro)";
    else if (isManual) rotulo = "(ISENTO manual)";
    else if (resp?.labelIsencao) rotulo = resp.labelIsencao;
    else if (resp?._err) rotulo = "(falha no cálculo)";
    
    out.textContent = resp?.valorBase==null ? "—" : `R$ ${Number(resp.valorBase||0).toFixed(2)} ${rotulo}`;
  }
  return resp;
}

// Getters/Setters auxiliares
export function getFreteAtual(){ return freteCtrl.ultimo || { valorBase:0, valorCobravel:0, isento:false }; }
export function setFreteSugestao(v){ freteCtrl.sugestao = v; }
export function getFreteSugestao(){ return freteCtrl.sugestao; }

// Listener para campo de frete manual
document.addEventListener('DOMContentLoaded', () => {
  const freteManualInput = document.getElementById('freteManual');
  if (freteManualInput) {
    freteManualInput.addEventListener('input', atualizarFreteUI);
    freteManualInput.addEventListener('change', atualizarFreteUI);
  }
});
