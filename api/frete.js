// DENTRO de portal/app/pedidos/js/frete.js
// Substitua APENAS a função calcularFrete por esta versão híbrida:

export async function calcularFrete(enderecoTexto, subtotal){
  if (!enderecoTexto) {
    return { valorBase:0, valorCobravel:0, isento:false, labelIsencao:"", _vazio:true };
  }
  const isentar = !!document.getElementById('isentarFrete')?.checked;

  // 1) Compat: se vier "lat,lon" -> usa /api/frete (legado)
  //    Formatos aceitos: "-30.1234,-51.5678" (com espaços opcionais)
  const coordsMatch = String(enderecoTexto).trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordsMatch) {
    try {
      const [_, lat, lon] = coordsMatch;
      const r = await fetch('/api/frete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: `${lat},${lon}`,
          profile: 'driving-car',
          isencao: isentar ? '1' : '0'
        })
      });
      if (!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();

      // Converte distance/duration em preço (faixas exemplo — ajuste como preferir)
      const distKm = (Number(data.distance_m)||0) / 1000;
      let valorBase = 0;
      if (isentar) {
        valorBase = 0;
      } else if (subtotal >= 200) {
        valorBase = 0;
      } else {
        // Tabela simplificada por distância (exemplo)
        if (distKm <= 5) valorBase = 10;
        else if (distKm <= 8) valorBase = 12;
        else if (distKm <= 12) valorBase = 15;
        else if (distKm <= 18) valorBase = 20;
        else valorBase = 25;
      }

      return {
        valorBase,
        valorCobravel: valorBase,
        isento: valorBase === 0,
        labelIsencao: (valorBase === 0) ? '(faixa de valor/distância)' : ''
      };
    } catch (_e) {
      // Se o legado falhar, cai para a rota nova
    }
  }

  // 2) Fluxo normal: usa /api/calcular-entrega (novo)
  const payload = {
    enderecoTexto,
    totalItens: subtotal,
    clienteIsento: isentar
  };

  // tenta endpoint local (novo)
  try{
    const r = await fetch("/api/calcular-entrega", {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    if(!r.ok) throw new Error("HTTP "+r.status);
    return await r.json();
  }catch(_){}

  // 3) Fallback absoluto (mantém teu ABS_FRETE_BASE externo se quiser)
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