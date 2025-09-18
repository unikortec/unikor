// app/estoque/js/store.js
import {
  STORAGE_KEY, SESSION_KEY, LAST_REPORT_KEY,
  loadJSON, saveJSON
} from "./constants.js";

// Estado local (LocalStorage)
export const catalogo = loadJSON(STORAGE_KEY, {});   // { [FAM]: { [PROD]: {RESFRIADO_KG, CONGELADO_KG} } }
export const sessao   = loadJSON(SESSION_KEY,  {});  // { [FAM]: { [PROD]: {RESFRIADO_KG, CONGELADO_KG} } }
export const ultimo   = { value: loadJSON(LAST_REPORT_KEY, null) }; // {dateISO, dateLabel, data:{...}} ou null

export function persist(){
  saveJSON(STORAGE_KEY, catalogo);
  saveJSON(SESSION_KEY,  sessao);
  if (ultimo.value) saveJSON(LAST_REPORT_KEY, ultimo.value);
}

export function clearSession(){
  // zera apenas os valores digitados da sessão (não mexe no catálogo)
  for (const fam of Object.keys(sessao)) {
    for (const prod of Object.keys(sessao[fam] || {})) {
      sessao[fam][prod] = { RESFRIADO_KG: 0, CONGELADO_KG: 0 };
    }
  }
  persist();
}
