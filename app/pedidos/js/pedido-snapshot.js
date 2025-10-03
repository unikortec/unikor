// app/pedidos/js/pedido-snapshot.js
import { getFreteAtual } from './frete.js';

const asNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? +n : 0;
};

export function buildSnapshotFromForm() {
  const itensEls = Array.from(document.querySelectorAll('#itens .item'));
  const itens = itensEls.map(el => {
    const produto = el.querySelector('.produto')?.value?.trim() || '';
    const tipo    = (el.querySelector('.tipo-select')?.value || 'KG').toUpperCase();
    const quantidade = asNum(el.querySelector('.quantidade')?.value || 0);
    const preco      = asNum(el.querySelector('.preco')?.value || 0);
    const obs        = el.querySelector('.obsItem')?.value?.trim() || '';
    // total já calculado na UI
    const totalTxt   = el.querySelector('.total-item')?.textContent?.replace(',', '.') || '0';
    const total      = asNum(totalTxt);
    return { produto, tipo, quantidade, preco, obs, total };
  }).filter(i => i.produto || i.quantidade || i.preco);

  const subtotal = +(itens.reduce((s,i)=>s + asNum(i.total), 0).toFixed(2));

  const frete = getFreteAtual() || { valorBase:0, valorCobravel:0, isento:false };
  const isentoMan = !!document.getElementById('isentarFrete')?.checked;
  const freteCobrado = isentoMan ? 0 : asNum(frete.valorCobravel ?? frete.valorBase ?? 0);

  const tipoEntrega = (document.querySelector('input[name="tipoEntrega"]:checked')?.value || 'ENTREGA').toUpperCase();

  const snapshot = {
    v: 1, // versão do snapshot
    cliente: (document.getElementById('cliente')?.value || '').trim(),
    endereco: (document.getElementById('endereco')?.value || '').trim(),
    dataEntregaISO: document.getElementById('entrega')?.value || null,
    horaEntrega: document.getElementById('horaEntrega')?.value || '',
    pagamento: (() => {
      const sel = document.getElementById('pagamento')?.value || '';
      if (sel.toUpperCase() !== 'OUTRO') return sel;
      const outro = (document.getElementById('pagamentoOutro')?.value || '').trim();
      return outro || 'OUTRO';
    })(),
    clienteFiscal: {
      cnpj: (document.getElementById('cnpj')?.value || '').replace(/\D/g,''),
      ie:   (document.getElementById('ie')?.value || '').trim(),
      cep:  (document.getElementById('cep')?.value || '').replace(/\D/g,''),
      contato: (document.getElementById('contato')?.value || '').replace(/\D/g,''),
    },
    entrega: { tipo: tipoEntrega, endereco: (document.getElementById('endereco')?.value || '').trim() },
    itens,
    subtotal,
    frete: {
      isento: !!(frete.isento || isentoMan),
      valorBase: asNum(frete.valorBase || 0),
      valorCobravel: freteCobrado
    },
    totalPedido: +(subtotal + freteCobrado).toFixed(2),
    obsGeral: (document.getElementById('obsGeral')?.value || '').trim()
  };

  return snapshot;
}