export async function calcularFrete(enderecoTexto, subtotal){
  if (!enderecoTexto) {
    return { valorBase:0, valorCobravel:0, isento:false, labelIsencao:"", _vazio:true };
  }
  
  const isentar = !!document.getElementById('isentarFrete')?.checked;
  
  // 🔥 PRIORIDADE 1: Se tem frete manual digitado (campo de entrada manual)
  const freteManualInput = document.getElementById('freteManual');
  if (freteManualInput && freteManualInput.value.trim()) {
    const valorManual = parseFloat(freteManualInput.value.replace(',', '.')) || 0;
    return { 
      valorBase: valorManual, 
      valorCobravel: isentar ? 0 : valorManual, 
      isento: isentar, 
      labelIsencao: isentar ? "(ISENTO manual)" : "(manual)", 
      _manual: true 
    };
  }
  
  // 🔥 PRIORIDADE 2: Se tem sugestão do cadastro do cliente
  if (freteCtrl.sugestao && typeof freteCtrl.sugestao === 'number') {
    const valorCadastro = freteCtrl.sugestao;
    return { 
      valorBase: valorCadastro, 
      valorCobravel: isentar ? 0 : valorCadastro, 
      isento: isentar, 
      labelIsencao: isentar ? "(ISENTO)" : "(do cadastro)", 
      _cadastro: true 
    };
  }
  
  // 🔥 PRIORIDADE 3: Calcular pela API com distância
  const payload = { enderecoTexto, totalItens: subtotal, clienteIsento: isentar };
  
  // 1) endpoint principal (raiz)
  try{
    const r = await fetch(`${API_BASE}/api/calcular-entrega`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    if(!r.ok) throw new Error("HTTP "+r.status);
    return await r.json();
  }catch(_){}
  
  // 2) fallback absoluto same-origin
  try{
    const r2 = await fetch(`${ABS_FRETE_BASE}/api/calcular-entrega`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    if(!r2.ok) throw new Error("HTTP "+r2.status);
    return await r2.json();
  }catch(_){
    return { valorBase:0, valorCobravel:0, isento:false, labelIsencao:"(falha no cálculo)", _err:true };
  }
}
