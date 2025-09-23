// app/pedidos/js/firebase.js
// Rodando isolado (sem login Unikor) mas salvando/consultando no tenant Serra Nobre.
// Quando formos plugar no app Unikor, basta trocar para extrair o tenant do token.

// 🔒 Tenant alvo (fixo por enquanto)
export const TENANT_ID = "serranobrecarnes.com.br";

// Placeholders para manter compatibilidade com imports existentes
export const authReady = Promise.resolve(null);
export const db = null;
export const app = null;
export const auth = null;