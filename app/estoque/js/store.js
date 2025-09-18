// app/estoque/js/store.js
// Persistência local do PWA de Estoque (catálogo, sessão, preços e snapshot)

// ---- Chaves de storage ----
export const STORAGE_KEY      = "estoque_v3_catalogo";
export const LAST_REPORT_KEY  = "estoque_v3_last_report";
export const PRICE_DB_KEY     = "estoque_v3_precos";
export const SESSION_KEY      = "estoque_v3_sessao";

// ---- Helpers JSON ----
const loadJSON = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
  catch { return fallback; }
};
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ---- Estado (bindings vivos / ES Modules) ----
export let catalogo = loadJSON(STORAGE_KEY, {});   // { [FAM]: { [PROD]: {RESFRIADO_KG, CONGELADO_KG} } }
export let priceDB  = loadJSON(PRICE_DB_KEY, {});  // { [FAM__PROD]: {price_kg, min_kg, updated_at} }
export let sessao   = loadJSON(SESSION_KEY, {});   // sessão atual (itens digitados)
export let ultimo   = loadJSON(LAST_REPORT_KEY, null); // último snapshot salvo

// ---- Sincronização (usada pelo catalog.js) ----
export function syncSave(){
  saveJSON(STORAGE_KEY, catalogo);
  saveJSON(PRICE_DB_KEY,  priceDB);
  saveJSON(SESSION_KEY,   sessao);
}

// ---- Preços / mínimos ----
const priceId = (f,p)=>`${f}__${p}`.toUpperCase().replace(/\s+/g,' ').trim();

export const getPriceKg = (f,p)=> +((priceDB[priceId(f,p)]?.price_kg) || 0);
export const getMinKg   = (f,p)=> +((priceDB[priceId(f,p)]?.min_kg)   || 0);

export function setPriceMin(f, p, priceKg, minKg){
  priceDB[priceId(f,p)] = {
    price_kg: +priceKg || 0,
    min_kg:   +minKg   || 0,
    updated_at: new Date().toISOString()
  };
  saveJSON(PRICE_DB_KEY, priceDB);
}

// ---- Sessão ----
export function clearSession(){
  sessao = {};                 // live binding: outros módulos veem a nova ref
  saveJSON(SESSION_KEY, sessao);
}

// ---- Último snapshot ----
export function setUltimo(snap){
  ultimo = snap;               // live binding
  saveJSON(LAST_REPORT_KEY, ultimo);
}
