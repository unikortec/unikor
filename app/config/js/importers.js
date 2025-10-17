import { downloadXLSX, readFileToJSON } from './utils.js';

export function modeloProdutos(){
  // Cabeçalho + exemplo
  return [
    { internalId:'', code:'501', name:'Agulha com osso', unit:'KG', price:20.97, active:true },
    { internalId:'', code:'503', name:'Vazio gaúcho', unit:'KG', price:0, active:true }
  ];
}
export function modeloCustos(){
  return [
    { internalId:'', code:'501', custo:'', posicao:'', obs:'' }
  ];
}
export function modeloMinimo(){
  return [
    { internalId:'', code:'501', minimo:'' }
  ];
}

export function baixarModelo(tipo){
  if (tipo==='produtos') downloadXLSX({ sheetName:'produtos', rows:modeloProdutos(), filename:'modelo_produtos.xlsx' });
  if (tipo==='custos')   downloadXLSX({ sheetName:'custos', rows:modeloCustos(), filename:'modelo_custos.xlsx' });
  if (tipo==='minimo')   downloadXLSX({ sheetName:'estoque_minimo', rows:modeloMinimo(), filename:'modelo_estoque_minimo.xlsx' });
}

export async function lerPlanilha(file){
  return await readFileToJSON(file); // retorna array de objetos chaveados pelo cabeçalho
}