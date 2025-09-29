import { getPriceKg, getMinKg, setPriceMin } from "./store.js";

export function gerarModeloConfigXLSX(FAMILIAS){
  const wb = window.XLSX.utils.book_new();
  const linhas = [["FAMILIA","PRODUTO","PRECO_KG","ESTOQUE_MINIMO"]];

  for (const f of FAMILIAS) {
    const conhecidos = new Set([...(f.itens || [])]);
    for (const p of Array.from(conhecidos).sort()) {
      const atualP = getPriceKg(f.nome,p) || '';
      const atualM = getMinKg(f.nome,p)   || '';
      linhas.push([f.nome, p, atualP, atualM]);
    }
  }

  const ws = window.XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = [{wch:24},{wch:36},{wch:12},{wch:16}];
  window.XLSX.utils.book_append_sheet(wb, ws, 'CONFIG');
  const wbout = window.XLSX.write(wb, {bookType:'xlsx', type:'array'});
  return new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

export async function importarConfigXLS(file, ensureCatalogEntry){
  const data = await file.arrayBuffer();
  const wb = window.XLSX.read(data, {type:'array'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, {header:1, defval:''});

  const header = (rows[0] || []).map(h=>String(h).trim().toUpperCase());
  const iF = header.indexOf('FAMILIA');
  const iP = header.indexOf('PRODUTO');
  const iPK = header.indexOf('PRECO_KG');
  const iMIN = header.indexOf('ESTOQUE_MINIMO');
  if(iF===-1 || iP===-1 || iPK===-1 || iMIN===-1){
    throw new Error('Planilha inválida. Cabeçalhos: FAMILIA | PRODUTO | PRECO_KG | ESTOQUE_MINIMO');
  }

  let ok = 0;
  for (let r = 1; r < rows.length; r++) {
    const fam = String(rows[r][iF] || '').toUpperCase().trim();
    const prod= String(rows[r][iP] || '').toUpperCase().trim();
    const pkStr= String(rows[r][iPK] ?? '').replace(',','.');
    const mnStr= String(rows[r][iMIN]?? '').replace(',','.');
    if (!fam || !prod) continue;

    const hasPK = pkStr !== '' && !isNaN(parseFloat(pkStr));
    const hasMN = mnStr !== '' && !isNaN(parseFloat(mnStr));
    if (!hasPK && !hasMN) continue;

    if (typeof ensureCatalogEntry === 'function') ensureCatalogEntry(fam, prod);

    const newPrice = hasPK ? parseFloat(pkStr) : getPriceKg(fam, prod);
    const newMin   = hasMN ? parseFloat(mnStr) : getMinKg(fam, prod);

    setPriceMin(fam, prod, newPrice, newMin);
    ok++;
  }
  return ok;
}

export { getPriceKg, getMinKg } from "./store.js";