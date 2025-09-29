// app/estoque/js/catalog.js
import { fmt3, round3 } from "./constants.js";
import { catalogo, sessao, persist } from "./store.js";

// Adiciona DIVERSOS (vazio para inclusão em tempo de uso)
export const FAMILIAS = [
  { nome:"BOVINO GANCHO", itens:["CASADO GANCHO","DIANTEIRO GANCHO","COSTELA GANCHO","CHULETA GANCHO","COXA GANCHO"]},
  { nome:"BOVINO CORTES", itens:["ALCATRA","CARNE CABEÇA","CHULETA PRONTA","COXÃO DURO","COXÃO MOLE","MAMINHA","RETALHO OU NABA","VAZIO"]},
  { nome:"CAIXARIAS", itens:["CAPA DO COXÃO","COSTELA","COXAO FORA","COXAO MOLE","PATINHO","VAZIO"]},
  { nome:"CORDEIRO", itens:["CARRÉ","COSTELA","PERNIL","PALETA","FILEZINHO"]},
  { nome:"EMBUTIDOS", itens:["BACON FATIADO","BACON MANTA","BOLINHA BORRUSSIA","CALABRESA FATIADA","CALABRESA MIGNON","CALABRESA TORTA","FRESCAL C/ PIMENTA","FRESCAL S/ PIMENTA","JUBOIA BORRUSIA","SALAME CURTO","SALAME NORMAL","SALSICHAO BORRUSSIA","SALSICHAO COLONIAL"]},
  { nome:"FRANGO", itens:["CORAÇÃO DE FRANGO","COXA DE FRANGO","COXA E SOBRECOXA DE FRANGO","COXA E SOBRECOXA DORSAL FRANGO","COXINHA DE FRANGO","FILE DE PEITO DE FRANGO","FRANGO INTEIRO","GALINHA VELHA","MOELA DE FRANGO","PEITO DE FRANGO COM OSSO","SOBRECOXA DE FRANGO","TULIPA DE FRANGO"]},
  { nome:"MIUDOS", itens:["CORAÇÃO BOVINO","FIGADO BOVINO","LINGUA BOVINA","RABADA BOVINA","CORAÇÃO SUINO","ORELHA SUINA","PEZINHO SUINO","RABINHO SUINO"]},
  { nome:"PEIXE", itens:["PANGA","PESCADO"]},
  { nome:"QUEIJOS", itens:["QUEIJO FATIADO","QUEIJO INTEIRO","QUEIJO COLONIAL","QUEIJO COALHO PEÇA","QUEIJO COALHO PALITO"]},
  { nome:"SUINO", itens:["CARRE SUINO","COSTELINHA SUINA","FILEZINHO SUINO","PALETA SUINA","PERNIL SUINO","SOBREPALETA SUINA"]},
  { nome:"DIVERSOS", itens:[] } // <— família solicitada (vazia)
];

export const PADROES = Object.fromEntries(FAMILIAS.map(f => [f.nome, new Set(f.itens)]));

// ---- helpers de catálogo/sessão ----
export function ensureCatalogEntry(fam, prod){
  catalogo[fam] ??= {};
  catalogo[fam][prod] ??= { RESFRIADO_KG: 0, CONGELADO_KG: 0 };
  persist();
}
export function ensureSessaoEntry(fam, prod){
  sessao[fam] ??= {};
  sessao[fam][prod] ??= { RESFRIADO_KG: 0, CONGELADO_KG: 0 };
  persist();
}
export function getSessao(fam, prod){
  return (sessao[fam]?.[prod]) || { RESFRIADO_KG: 0, CONGELADO_KG: 0 };
}
export function setSessaoKg(fam, prod, tipo, kg){
  ensureSessaoEntry(fam, prod);
  if (tipo === "RESFRIADO") sessao[fam][prod].RESFRIADO_KG = round3(+kg || 0);
  else                      sessao[fam][prod].CONGELADO_KG = round3(+kg || 0);
  persist();
}
export function editBothKg(fam, prod, rk, ck){
  ensureSessaoEntry(fam, prod);
  sessao[fam][prod].RESFRIADO_KG = round3(+rk || 0);
  sessao[fam][prod].CONGELADO_KG = round3(+ck || 0);
  persist();
}
export function clearItem(fam, prod){
  if (sessao[fam]?.[prod]) {
    sessao[fam][prod] = { RESFRIADO_KG: 0, CONGELADO_KG: 0 };
    persist();
  }
}
// remove do catálogo **apenas** se não for item padrão
export function deleteIfCustom(fam, prod){
  if (!PADROES[fam]?.has(prod)) {
    if (catalogo[fam]) delete catalogo[fam][prod];
    if (sessao[fam])   delete sessao[fam][prod];
    persist();
    return true;
  }
  return false;
}
export function itensDigitadosDaFamilia(fam){
  const prods = Object.keys(catalogo[fam] || {});
  return prods.filter(p => {
    const v = sessao[fam]?.[p];
    return v && ((v.RESFRIADO_KG || 0) > 0 || (v.CONGELADO_KG || 0) > 0);
  }).sort();
}
export function resumoTexto(fam, prod){
  const s = getSessao(fam, prod);
  return `Resfriado ${fmt3(s.RESFRIADO_KG)} kg | Congelado ${fmt3(s.CONGELADO_KG)} kg`;
}