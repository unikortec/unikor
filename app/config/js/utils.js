export const norm = s => (s??"").toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
export const isBlank = v => v===undefined || v===null || (typeof v==='string' && v.trim()==='');
export function uuid(){ // RFC4122 v4 simplificado
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==='x'? r : (r&0x3|0x8);
    return v.toString(16);
  });
}
export function downloadXLSX({sheetName='Planilha', rows=[{}], filename='modelo.xlsx'}){
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
export async function readFileToJSON(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type:'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval:"" });
}