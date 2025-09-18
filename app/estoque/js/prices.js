import { PRICE_DB_KEY } from "./constants.js";
import { saveJSON, priceDB, catalogo } from "./store.js";

// price id
export const priceId = (f,p)=>`${f}__${p}`.toUpperCase().replace(/\s+/g,' ').trim();
export const getPriceKg = (f,p)=> +((priceDB[priceId(f,p)]?.price_kg)||0);
export const getMinKg   = (f,p)=> +((priceDB[priceId(f,p)]?.min_kg)||0);
export const setPriceMin = (f,p,priceKg,minKg)=>{
  priceDB[priceId(f,p)]={price_kg:+priceKg||0, min_kg:+minKg||0, updated_at:new Date().toISOString()};
  saveJSON(PRICE_DB_KEY, priceDB);
};

// XLSX
export function gerarModeloConfigXLSX(FAMILIAS){
  const wb = XLSX.utils.book_new();
  const linhas = [["FAMILIA","PRODUTO","PRECO_KG","ESTOQUE_MINIMO"]];
  for(const f of FAMILIAS){
    const todos=[...new Set([...f.itens, ...Object.keys(catalogo[f.nome]||{})])].sort();
    for(const p of todos){
      const atualP = getPriceKg(f.nome,p) || '';
      const atualM = getMinKg(f.nome,p)   || '';
      linhas.push([f.nome, p, atualP, atualM]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = [{wch:24},{wch:36},{wch:12},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws, 'CONFIG');
  const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  return new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

export async function importarConfigXLS(file, ensureCatalogEntry){
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, {type:'array'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  const header = rows[0].map(h=>String(h).trim().toUpperCase());
  const iF = header.indexOf('FAMILIA'),
        iP = header.indexOf('PRODUTO'),
        iPK = header.indexOf('PRECO_KG'),
        iMIN = header.indexOf('ESTOQUE_MINIMO');
  if(iF===-1 || iP===-1 || iPK===-1 || iMIN===-1){
    alert('Planilha inválida. Cabeçalhos: FAMILIA | PRODUTO | PRECO_KG | ESTOQUE_MINIMO');
    return 0;
  }
  let ok=0;
  for(let r=1;r<rows.length;r++){
    const fam = String(rows[r][iF]||'').toUpperCase().trim();
    const prod= String(rows[r][iP]||'').toUpperCase().trim();
    const pkStr= String(rows[r][iPK]).replace(',','.');
    const mnStr= String(rows[r][iMIN]).replace(',','.');
    if(!fam || !prod) continue;

    const hasPK = pkStr !== '' && !isNaN(parseFloat(pkStr));
    const hasMN = mnStr !== '' && !isNaN(parseFloat(mnStr));
    if(!hasPK && !hasMN) continue;

    ensureCatalogEntry(fam, prod);
    const cur = priceDB[priceId(fam,prod)] || { price_kg:0, min_kg:0 };
    const newPrice = hasPK ? parseFloat(pkStr) : cur.price_kg;
    const newMin   = hasMN ? parseFloat(mnStr) : cur.min_kg;

    setPriceMin(fam, prod, newPrice, newMin);
    ok++;
  }
  return ok;
}
