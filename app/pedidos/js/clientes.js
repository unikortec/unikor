// app/pedidos/js/clientes.js
import { TENANT_ID } from './firebase.js';

const up = (s)=>String(s||"").trim().toUpperCase();
const digits = (s)=>String(s||"").replace(/\D/g,"");

// ======= BUSCAS =======
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

// ======= CADASTRO =======
export async function criarCliente(payload){
  const body = { tenantId: TENANT_ID, cliente: payload };
  const r = await fetch("/api/tenant-clientes/create", {
    method:"POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("Falha ao salvar cliente");
  return r.json();
}

// ======= LOOKUP IE (RS) =======
export async function lookupIEporCNPJ(cnpj){
  const r = await fetch("/api/rs-ie/lookup", {
    method:"POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ cnpj })
  });
  if (!r.ok) return { ok:false };
  return r.json();
}

// ======= UI helpers (modal) =======
export function wireClienteModal(){
  const modal = document.getElementById("clienteModal");
  const openBtn = document.getElementById("btnNovoCliente");
  const closeEls = modal?.querySelectorAll("[data-close]");
  const salvarBtn = document.getElementById("btnSalvarCliente");
  const lookupBtn = document.getElementById("btnLookupIE");

  if (!modal || !openBtn || !salvarBtn) return;

  const open = ()=> modal.hidden = false;
  const close = ()=> modal.hidden = true;

  openBtn.addEventListener("click", open);
  closeEls?.forEach(el => el.addEventListener("click", close));
  modal.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  // Lookup IE (RS)
  lookupBtn?.addEventListener("click", async ()=>{
    const cnpjEl = document.getElementById("cli_cnpj");
    const ieEl = document.getElementById("cli_ie");
    const cnpj = digits(cnpjEl.value);
    if (!cnpj || cnpj.length < 14) { alert("Informe um CNPJ válido primeiro."); return; }
    lookupBtn.disabled = true; lookupBtn.textContent = "Consultando...";
    try{
      const resp = await lookupIEporCNPJ(cnpj);
      if (resp?.ok) {
        if (resp.isento || !resp.ie) {
          ieEl.value = "ISENTO";
        } else {
          ieEl.value = resp.ie.toString().toUpperCase();
        }
      } else {
        alert("Não foi possível consultar. Preencha manualmente ou use ISENTO.");
      }
    } finally {
      lookupBtn.disabled = false; lookupBtn.textContent = "Consultar IE";
    }
  });

  // Salvar Cliente
  salvarBtn.addEventListener("click", async ()=>{
    const nome = up(document.getElementById("cli_nome").value);
    if (!nome) { alert("Nome é obrigatório."); return; }

    const payload = {
      nome,
      cnpj: digits(document.getElementById("cli_cnpj").value),
      ie: up(document.getElementById("cli_ie").value || ""),
      cep: digits(document.getElementById("cli_cep").value),
      endereco: up(document.getElementById("cli_endereco").value),
      contato: digits(document.getElementById("cli_contato").value),
      isentoFrete: !!document.getElementById("cli_isentoFrete").checked,
      compras: 0
    };

    salvarBtn.disabled = true; salvarBtn.textContent = "Salvando...";
    try{
      const resp = await criarCliente(payload);
      if (!resp?.ok) throw new Error(resp?.error || "Erro ao salvar");
      alert(resp.reused ? "Cliente atualizado com sucesso." : "Cliente cadastrado com sucesso.");
      close();
      // Opcional: preencher o campo de cliente com o nome recém salvo
      const cli = document.getElementById("cliente");
      if (cli) cli.value = nome;
    } catch(e) {
      alert("Falha ao salvar cliente: " + (e?.message || e));
    } finally {
      salvarBtn.disabled = false; salvarBtn.textContent = "Salvar Cliente";
    }
  });
}

// Placeholders compat
export async function buscarUltimoPreco(){ return null; }
export async function produtosDoCliente(){ return []; }
export async function registrarPrecoCliente(){ return; }
export async function updateLastFreteCliente(){ return; }