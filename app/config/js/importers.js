import { downloadXLSX, readFileToJSON } from './utils.js';

export function modeloProdutos(){
  return [
    { internalId:'', name:'501 - Agulha com osso KG', unit:'KG', price:20.97, active:true },
    { internalId:'', name:'503 - Vazio gaúcho KG',    unit:'KG', price:0,     active:true }
  ];
}

export function modeloCustos(){
  return [
    { internalId:'', name:'501 - Agulha com osso KG', custo:'', posicao:'', obs:'' }
  ];
}

export function modeloMinimo(){
  return [
    { internalId:'', name:'501 - Agulha com osso KG', minimo:'' }
  ];
}

export function baixarModelo(tipo){
  if (tipo==='produtos')
    downloadXLSX({ sheetName:'produtos', rows:modeloProdutos(), filename:'modelo_produtos.xlsx' });
  if (tipo==='custos')
    downloadXLSX({ sheetName:'custos', rows:modeloCustos(), filename:'modelo_custos.xlsx' });
  if (tipo==='minimo')
    downloadXLSX({ sheetName:'estoque_minimo', rows:modeloMinimo(), filename:'modelo_estoque_minimo.xlsx' });
}

export async function lerPlanilha(file){
  return await readFileToJSON(file); // lê por cabeçalho
}