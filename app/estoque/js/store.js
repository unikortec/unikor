import { STORAGE_KEY, SESSION_KEY, LAST_REPORT_KEY, PRICE_DB_KEY, loadJSON, saveJSON, round3 } from "./constants.js";
import { FAMILIAS } from "./catalog.js";

export let catalogo = loadJSON(STORAGE_KEY,{});
for(const fam of FAMILIAS){
  catalogo[fam.nome] ??= {};
  for(const p of fam.itens){
    catalogo[fam.nome][p] ??= { RESFRIADO_KG:0, CONGELADO_KG:0 };
  }
}
saveJSON(STORAGE_KEY,catalogo);

export let priceDB = loadJSON(PRICE_DB_KEY,{});
const priceId = (f,p)=>`${f}__${p}`.toUpperCase().replace(/\s+/g,' ').trim();
export const getPriceKg = (f,p)=> +((priceDB[priceId(f,p)]?.price_kg)||0);
export const getMinKg   = (f,p)=> +((priceDB[priceId(f,p)]?.min_kg)||0);
export const setPriceMin= (f,p,priceKg,minKg)=>{ priceDB[priceId(f,p)]={price_kg:+priceKg||0, min_kg:+minKg||0, updated_at:new Date().toISOString()}; saveJSON(PRICE_DB_KEY,priceDB); };

export let sessao = loadJSON(SESSION_KEY, {});
export function ensureSessao(fam,prod){ sessao[fam]??={}; sessao[fam][prod]??={RESFRIADO_KG:0, CONGELADO_KG:0}; }
export function clearSession(){ sessao={}; saveJSON(SESSION_KEY,sessao); }
export function saveSession(){ saveJSON(SESSION_KEY,sessao); }

export let ultimo = loadJSON(LAST_REPORT_KEY,null);
export function setUltimo(snap){ ultimo = snap; localStorage.setItem(LAST_REPORT_KEY, JSON.stringify(snap)); }

export function ensureCatalogEntry(fam,prod){
  catalogo[fam] ??= {};
  catalogo[fam][prod] ??= { RESFRIADO_KG:0, CONGELADO_KG:0 };
  saveJSON(STORAGE_KEY,catalogo);
}

export function snapshotFromSession(){
  const s={};
  for(const fam of FAMILIAS){
    const famName=fam.nome;
    const prods = Object.keys(catalogo[famName]||{});
    for(const p of prods){
      const v = sessao[famName]?.[p];
      if(!v) continue;
      const rk=round3(v.RESFRIADO_KG||0), ck=round3(v.CONGELADO_KG||0);
      if(rk<=0 && ck<=0) continue;
      s[famName] ??= {};
      s[famName][p] = { RESFRIADO_KG:rk, CONGELADO_KG:ck, SUM_KG:round3(rk+ck) };
    }
  }
  return s;
}
