// app/pedidos/js/clientes.js
// Consulta clientes do tenant via endpoints server-side (Admin SDK no backend)
import { TENANT_ID } from './firebase.js';

const up = (s)=>String(s||"").trim().toUpperCase();

export async function getClienteDocByNome(nomeInput){
  try{
    const r = await fetch("/api/tenant-clientes/find", {
      method:"POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ tenantId: TENANT_ID, nome: nomeInput })
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.ok || !j.found) return null;
    return { id: j.id, data: j.data };
  }catch(_){
    return null;
  }
}

export async function salvarCliente(){ /* opcional: implementar quando necessário no server */ }

export async function buscarClienteInfo(nomeCliente){
  const hit = await getClienteDocByNome(nomeCliente);
  if (!hit) return null;
  const d = hit.data || {};
  return {
    endereco: d.endereco || "",
    isentoFrete: !!d.isentoFrete,
    cnpj: d.cnpj || "",
    ie: d.ie || "",
    cep: d.cep || "",
    contato: d.contato || "",
    lastFrete: typeof d.lastFrete === "number" ? d.lastFrete : null
  };
}

export async function clientesMaisUsados(n=50){
  try{
    const r = await fetch(`/api/tenant-clientes/top?tenantId=${encodeURIComponent(TENANT_ID)}&n=${n}`, { cache:"no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.itens) ? j.itens : [];
  }catch(_){
    return [];
  }
}

// Placeholders (podemos expor endpoints depois)
export async function buscarUltimoPreco(){ return null; }
export async function produtosDoCliente(){ return []; }
export async function registrarPrecoCliente(){ return; }
export async function updateLastFreteCliente(){ return; }