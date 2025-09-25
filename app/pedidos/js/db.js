// app/pedidos/js/db.js
// Salva pedido uma única vez usando idempotencyKey no backend do tenant.
import { TENANT_ID } from './firebase.js';
import { up } from './utils.js';


function normalizeEnderecoForKey(str){ return up(str).replace(/\s+/g,' ').trim(); }
function itemsSig(items){
  if (!Array.isArray(items)) return '';
  return items.map(i=>[
    (i.produto||'').trim().replace(/\|/g,'/'),
    (i.tipo||''),
    Number(i.quantidade||0).toFixed(3),
    Number(i.preco||i.precoUnit||0).toFixed(2),
    Number(i.total||0).toFixed(2)
  ].join(':')).join(';');
}


export function buildIdempotencyKey(payload){
  return [
    payload.dataEntregaISO||"",
    payload.horaEntrega||"",
    up(payload.cliente||""),
    (payload.entrega?.tipo||""),
    normalizeEnderecoForKey(payload.entrega?.endereco||""),
    String(payload.subtotal?.toFixed ? payload.subtotal.toFixed(2) : Number(payload.subtotal||0).toFixed(2)),
    String(Array.isArray(payload.itens) ? payload.itens.length : 0),
    itemsSig(payload.itens),
    (payload.clienteFiscal?.cnpj||""),
    (payload.clienteFiscal?.ie||""),
    (payload.clienteFiscal?.cep||""),
    (payload.clienteFiscal?.contato||"")
  ].join("|");
}


export async function savePedidoIdempotente(payload){
  const idempotencyKey = buildIdempotencyKey(payload);


  const r = await fetch("/api/tenant-pedidos/salvar", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ tenantId: TENANT_ID, payload, idempotencyKey })
  });


  if (!r.ok) throw new Error("Falha ao salvar pedido");
  return r.json();
}
