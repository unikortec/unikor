// app/estoque/js/store.js
import {
  STORAGE_KEY, SESSION_KEY, LAST_REPORT_KEY, PRICE_DB_KEY,
  loadJSON, saveJSON
} from "./constants.js";

// ---- Estado persistente (LocalStorage) ----
export const catalogo = loadJSON(STORAGE_KEY, {});     // { [FAM]: { [PROD]: {RESFRIADO_KG, CONGELADO_KG} } }
export const sessao   = loadJSON(SESSION_KEY,  {});    // { [FAM]: { [PROD]: {RESFRIADO_KG, CONGELADO_KG} } }
export const ultimo   = { value: loadJSON(LAST_REPORT_KEY, null) }; // {dateISO, dateLabel, data:{...}} ou null

// Base de preços e mínimos
export const priceDB  = loadJSON(PRICE_DB_KEY, {});    // { [priceId]: { price_kg, min_kg, updated_at } }

export function persist(){
  saveJSON(STORAGE_KEY, catalogo);
  saveJSON(SESSION_KEY,  sessao);
  saveJSON(PRICE_DB_KEY, priceDB);
  if (ultimo.value) saveJSON(LAST_REPORT_KEY, ultimo.value);
}

// Zera apenas os valores digitados da sessão
export function clearSession(){
  for (const fam of Object.keys(sessao)) {
    for (const prod of Object.keys(sessao[fam] || {})) {
      sessao[fam][prod] = { RESFRIADO_KG: 0, CONGELADO_KG: 0 };
    }
  }
  persist();
}

// ---- Helpers de preço/mínimo ----
export const priceId = (f,p)=>`${f}__${p}`.toUpperCase().replace(/\s+/g,' ').trim();

export function getPriceKg(f,p){
  return +((priceDB[priceId(f,p)]?.price_kg) || 0);
}
export function getMinKg(f,p){
  return +((priceDB[priceId(f,p)]?.min_kg) || 0);
}
export function setPriceMin(f,p,priceKg,minKg){
  priceDB[priceId(f,p)] = {
    price_kg: +priceKg || 0,
    min_kg:   +minKg   || 0,
    updated_at: new Date().toISOString()
  };
  persist();
}
