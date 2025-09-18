// store.js — estado local (catálogo, sessão, preços) + helpers
import {
  STORAGE_KEY, LAST_REPORT_KEY, PRICE_DB_KEY, SESSION_KEY,
  loadJSON, saveJSON
} from "./constants.js";

// ---------- Estados ----------
export let catalogo = loadJSON(STORAGE_KEY, {});   // { [FAM]: { [PROD]: {RESFRIADO_KG, CONGELADO_KG} } }
export let sessao   = loadJSON(SESSION_KEY,  {});  // { [FAM]: { [PROD]: {RESFRIADO_KG, CONGELADO_KG} } }
export const ultimo = { value: loadJSON(LAST_REPORT_KEY, null) }; // snapshot anterior (quando existir)

// Preços: { [ID]: { price_kg, min_kg, updated_at } }
export let priceDB  = loadJSON(PRICE_DB_KEY, {});
const priceId = (f,p)=>`${f}__${p}`.toUpperCase().replace(/\s+/g,' ').trim();

// ---------- Getters/Setters de preços ----------
export const getPriceKg = (f,p)=> +((priceDB[priceId(f,p)]?.price_kg)||0);
export const getMinKg   = (f,p)=> +((priceDB[priceId(f,p)]?.min_kg)||0);
export function setPriceMin(f,p, priceKg, minKg){
  priceDB[priceId(f,p)] = {
    price_kg:+priceKg||0,
    min_kg:+minKg||0,
    updated_at:new Date().toISOString()
  };
  saveJSON(PRICE_DB_KEY, priceDB);
}

// ---------- Helpers catálogo/sessão ----------
export function ensureCatalogEntry(fam,prod){
  catalogo[fam] ??= {};
  catalogo[fam][prod] ??= { RESFRIADO_KG:0, CONGELADO_KG:0 };
  saveJSON(STORAGE_KEY, catalogo);
}
export function ensureSessaoEntry(fam,prod){
  sessao[fam] ??= {};
  sessao[fam][prod] ??= { RESFRIADO_KG:0, CONGELADO_KG:0 };
  saveJSON(SESSION_KEY, sessao);
}
export function clearSession(){
  sessao = {};
  saveJSON(SESSION_KEY, sessao);
}

// Salva ambos os estados (catálogo + sessão)
export function syncSave(){
  saveJSON(STORAGE_KEY, catalogo);
  saveJSON(SESSION_KEY, sessao);
}

// Alias para compatibilidade com versões do catalog.js que importam `persist`
export { syncSave as persist };
