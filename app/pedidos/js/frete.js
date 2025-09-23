// app/pedidos/js/frete.js
// Detecta o prefixo "/app" para as APIs no Unikor (ex.: /app/api/calcular-entrega)
function getBaseApiPrefix() {
  const p = location.pathname;
  // pega o primeiro segmento depois da barra inicial
  const firstSeg = "/" + p.split("/").filter(Boolean)[0];
  // se estiver dentro de /app/... → usa /app, senão usa raiz
  return firstSeg === "/app" ? "/app" : "";
}

// fallback absoluto (caso esteja usando preview/ambiente sem API local)
export const ABS_FRETE_BASE = `${location.origin}${getBaseApiPrefix()}`;

const freteCtrl = { ultimo: null, sugestao: null };

function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

function appendPOA(str){
  const t = String(str||"").trim();
  if (!t) return t;
  if (/porto\s*alegre/i.test(t)) return t;
  const TEM_CIDADE = /,\s*([A-Za-zÀ-ÿ'.\-\s]{2,})(?:\s*-\s*[A-Za-z]{2})?/i;
  if (TEM_CIDADE.test(t)) return t;
  return `${t}, Porto Alegre - RS`;
}

export async function calcularFrete(enderecoTexto, subtotal){
  if (!enderecoTexto) {
    return { valorBase:0, valorCobravel:0, isento:false, labelIsencao:"", _vazio:true };
  }
  const isentar = !!document.getElementById('isentarFrete')?.checked;
  const payload = { enderecoTexto, totalItens: subtotal, clienteIsento: isentar };

  // 1) tenta same-origin com prefixo correto (ex.: /app/api/...)
  try{
    const r = await fetch(`${getBaseApiPrefix()}/api/calcular-entrega`, {
      method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    if(!r.ok) throw new Error("HTTP "+r.status);
    return await r.json();
  }catch(_){}

  // 2) fallback absoluto
  try{
    const r2 = await fetch(`${ABS_FRETE_BASE}/api/calcular-entrega`, {
      method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    if(!r2.ok) throw new Error("HTTP "+r2.status);
    return await r2.json();
  }catch(_){
    return { valorBase:0, valorCobravel:0, isento:false, labelIsencao:"(falha no cálculo)", _err:true };
  }
}

export const atualizarFreteUI = debounce(async function(){
  const out = document.getElementById("freteValor");
  if (!out) return;

  let end = document.getElementById("endereco")?.value?.trim()?.toUpperCase() || "";
  end = appendPOA(end);

  const totais = Array.from(document.querySelectorAll("[id^='totalItem_']"))
    .map(el => parseFloat(String(el.textContent||"0").replace(",", ".")) || 0);
  const subtotal = totais.reduce((s,v)=>s+(v||0),0);

  const resp = await calcularFrete(end, subtotal);
  freteCtrl.ultimo = resp;

  const isManual = !!document.getElementById('isentarFrete')?.checked;
  const rotulo = isManual ? "(ISENTO manual)" : (resp?.labelIsencao || (resp?._err?"(falha no cálculo)":""));
  out.textContent = resp?.valorBase==null ? "—" : `R$ ${Number(resp.valorBase||0).toFixed(2)} ${rotulo}`;
}, 300);

export async function ensureFreteBeforePDF(){
  const out = document.getElementById("freteValor");

  let end = document.getElementById("endereco")?.value?.trim()?.toUpperCase() || "";
  end = appendPOA(end);

  // Subtotal preciso lendo inputs
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
    const rotulo = isManual ? "(ISENTO manual)" : (resp?.labelIsencao || (resp?._err?"(falha no cálculo)":""));
    out.textContent = resp?.valorBase==null ? "—" : `R$ ${Number(resp.valorBase||0).toFixed(2)} ${rotulo}`;
  }
  return resp;
}

export function getFreteAtual(){ return freteCtrl.ultimo || { valorBase:0, valorCobravel:0, isento:false }; }
export function setFreteSugestao(v){ freteCtrl.sugestao = v; }
export function getFreteSugestao(){ return freteCtrl.sugestao; }