// portal/app/pedidos/js/frete.js
// ==================== Config ====================
export const ABS_FRETE_BASE = "https://app.unikor.com.br"; // fallback absoluto (opcional)

// ==================== Estado interno ====================
const freteCtrl = { ultimo: null, sugestao: null };

// ==================== Utils ====================
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

// Se o endereço não trouxer cidade, assume POA
function appendPOA(str){
  const t = String(str||"").trim();
  if (!t) return t;
  if (/porto\s*alegre/i.test(t)) return t;
  const TEM_CIDADE = /,\s*([A-Za-zÀ-ÿ'.\-\s]{2,})(?:\s*-\s*[A-Za-z]{2})?/i;
  if (TEM_CIDADE.test(t)) return t;
  return `${t}, Porto Alegre - RS`;
}

// ==================== Cálculo / chamadas HTTP ====================
/**
 * Estratégia híbrida:
 *  - Se enderecoTexto for "lat,lon" => chama /portal/api/frete (legado ORS)
 *  - Caso contrário => chama /portal/api/calcular-entrega (novo)
 *  - Se falhar, tenta fallback em ABS_FRETE_BASE
 */
export async function calcularFrete(enderecoTexto, subtotal){
  if (!enderecoTexto) {
    return { valorBase:0, valorCobravel:0, isento:false, labelIsencao:"", _vazio:true };
  }

  const isentar = !!document.getElementById('isentarFrete')?.checked;

  // 1) Compat: coordenadas "lat,lon" => usa /portal/api/frete (legado)
  const coordsMatch = String(enderecoTexto).trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordsMatch) {
    try {
      const [_, lat, lon] = coordsMatch;
      const r = await fetch("/portal/api/frete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: `${lat},${lon}`,
          profile: "driving-car",
          isencao: isentar ? "1" : "0"
        })
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();

      // Conversão simples distância -> preço (ajuste livre)
      const distKm = (Number(data.distance_m)||0)/1000;
      let valorBase = 0;
      if (isentar || subtotal >= 200) {
        valorBase = 0;
      } else if (distKm <= 5) valorBase = 10;
      else if (distKm <= 8)  valorBase = 12;
      else if (distKm <= 12) valorBase = 15;
      else if (distKm <= 18) valorBase = 20;
      else valorBase = 25;

      return {
        valorBase,
        valorCobravel: valorBase,
        isento: valorBase === 0,
        labelIsencao: (valorBase === 0) ? "(faixa de valor/distância)" : ""
      };
    } catch {
      // se falhar, continua para a rota nova
    }
  }

  // 2) Rota nova (principal): /portal/api/calcular-entrega
  const payload = {
    enderecoTexto,
    totalItens: subtotal,
    clienteIsento: isentar
  };

  try{
    const r = await fetch("/portal/api/calcular-entrega", {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    if(!r.ok) throw new Error("HTTP "+r.status);
    return await r.json();
  }catch(_){}

  // 3) Fallback absoluto (opcional) para o mesmo domínio
  try{
    const r2 = await fetch(`${ABS_FRETE_BASE}/portal/api/calcular-entrega`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    if(!r2.ok) throw new Error("HTTP "+r2.status);
    return await r2.json();
  }catch(_){
    return { valorBase:0, valorCobravel:0, isento:false, labelIsencao:"(falha no cálculo)", _err:true };
  }
}

// ==================== UI: atualização do rótulo (debounced) ====================
export const atualizarFreteUI = debounce(async function(){
  const out = document.getElementById("freteValor");
  if (!out) return;

  let end = document.getElementById("endereco")?.value?.trim() || "";
  // Se NÃO for lat,lon, normaliza com POA
  if (!/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(end)) {
    end = appendPOA(end.toUpperCase());
  }

  // Subtotal baseado nos totais já renderizados
  const totais = Array.from(document.querySelectorAll("[id^='totalItem_']"))
    .map(el => parseFloat(String(el.textContent||"0").replace(",", ".")) || 0);
  const subtotal = totais.reduce((s,v)=>s+(v||0),0);

  const resp = await calcularFrete(end, subtotal);
  freteCtrl.ultimo = resp;

  const isManual = !!document.getElementById('isentarFrete')?.checked;
  const rotulo = isManual ? "(ISENTO manual)" : (resp?.labelIsencao || (resp?._err?"(falha no cálculo)":""));
  out.textContent = resp?.valorBase==null ? "—" : `R$ ${Number(resp.valorBase||0).toFixed(2)} ${rotulo}`;
}, 300);

// ==================== PDF: garantir frete antes de gerar ====================
export async function ensureFreteBeforePDF(){
  const out = document.getElementById("freteValor");

  // endereço normalizado (mantém lat,lon quando for o caso)
  let end = document.getElementById("endereco")?.value?.trim() || "";
  if (!/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(end)) {
    end = appendPOA(end.toUpperCase());
  }

  // Subtotal preciso pelos inputs dos itens (com regra de UN por kg)
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
  } else {
    const totais = Array.from(document.querySelectorAll("[id^='totalItem_']"))
      .map(el => parseFloat(String(el.textContent||"0").replace(",", ".")) || 0);
    subtotal = totais.reduce((s,v)=>s+(v||0),0);
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

// ==================== Getters/Setters expostos ====================
export function getFreteAtual(){ return freteCtrl.ultimo || { valorBase:0, valorCobravel:0, isento:false }; }
export function setFreteSugestao(v){ freteCtrl.sugestao = v; }
export function getFreteSugestao(){ return freteCtrl.sugestao; }