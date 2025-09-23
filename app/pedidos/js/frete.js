// js/frete.js
export const ABS_FRETE_BASE = "https://serranobre-iota.vercel.app"; // fallback

// Estado interno (último frete calculado e sugestão vinda do cliente)
const freteCtrl = { ultimo: null, sugestao: null };

// Util
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
  const payload = { enderecoTexto, totalItens: subtotal, clienteIsento: isentar };

  // tenta endpoint local
  try{
    const r = await fetch("/api/calcular-entrega", {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    if(!r.ok) throw new Error("HTTP "+r.status);
    return await r.json();
  }catch(_){}

  // fallback absoluto
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
  const rotulo = isManual ? "(ISENTO manual)" : (resp?.labelIsencao || (resp?._err?"(falha no cálculo)":""));
  out.textContent = resp?.valorBase==null ? "—" : `R$ ${Number(resp.valorBase||0).toFixed(2)} ${rotulo}`;
}, 300);

// ---- Função exigida pelo pdf.js (SEM debounce) ----
// Garante que exista um frete “pronto” antes de gerar o PDF
export async function ensureFreteBeforePDF(){
  const out = document.getElementById("freteValor");

  // endereço normalizado
  let end = document.getElementById("endereco")?.value?.trim()?.toUpperCase() || "";
  end = appendPOA(end);

  // Subtotal preciso baseado nos inputs dos itens (se disponíveis) com fallback ao DOM do total
  const itensEls = Array.from(document.querySelectorAll(".item"));
  let subtotal = 0;
  if (itensEls.length){
    itensEls.forEach((el,i)=>{
      const q = parseFloat(el.querySelector(".quantidade")?.value || "0") || 0;
      const p = parseFloat(el.querySelector(".preco")?.value || "0") || 0;
      const tipo = (el.querySelector(".tipo-select")?.value || "KG").toUpperCase();
      const prod = (el.querySelector(".produto")?.value || "").toLowerCase();

      // mesma regra de peso por unidade usada no app
      const m = /(\d+(?:[.,]\d+)?)[\s]*(kg|quilo|quilos|g|gr|grama|gramas)\b/.exec(prod);
      if (tipo === "UN" && m){
        const val = parseFloat((m[1]||"").replace(",", ".")) || 0;
        const kgUn = (m[2] === "kg" || m[2].startsWith("quilo")) ? val : val/1000;
        subtotal += (q * kgUn) * p;
      } else {
        subtotal += q * p;
      }
    });
  } else {
    const totais = Array.from(document.querySelectorAll("[id^='totalItem_']"))
      .map(el => parseFloat(String(el.textContent||"0").replace(",", ".")) || 0);
    subtotal = totais.reduce((s,v)=>s+(v||0),0);
  }

  const resp = await calcularFrete(end, subtotal);
  freteCtrl.ultimo = resp;

  // Reflete UI (sem debounce)
  if (out){
    const isManual = !!document.getElementById('isentarFrete')?.checked;
    const rotulo = isManual ? "(ISENTO manual)" : (resp?.labelIsencao || (resp?._err?"(falha no cálculo)":""));
    out.textContent = resp?.valorBase==null ? "—" : `R$ ${Number(resp.valorBase||0).toFixed(2)} ${rotulo}`;
  }

  return resp;
}

// Getters/Setters auxiliares usados no app/pdf
export function getFreteAtual(){ return freteCtrl.ultimo || { valorBase:0, valorCobravel:0, isento:false }; }
export function setFreteSugestao(v){ freteCtrl.sugestao = v; }
export function getFreteSugestao(){ return freteCtrl.sugestao; }