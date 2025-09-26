// app/pedidos/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBuUQsB7AohqjzqJlTD3AvLwD5EbKjJVqU",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.appspot.com",
  messagingSenderId: "484386062712",
  appId: "1:484386062712:web:c8e5b6b4e7e9a3a7c8a6e7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Tenant ID fixo para app pedidos
export const TENANT_ID = "serranobrecarnes.com.br";

// Funções para acessar dados do usuário logado (vêm do auth-guard)
export function getCurrentUser() {
  return auth.currentUser;
}

export function isLoggedIn() {
  return auth.currentUser !== null;
}

// Verificar se usuário tem acesso ao tenant
export async function hasAccessToTenant() {
  const user = getCurrentUser();
  if (!user) return false;
  
  try {
    const tokenResult = await user.getIdTokenResult(true);
    const userTenantId = tokenResult.claims.tenantId;
    const userRole = tokenResult.claims.role;
    
    return (userTenantId === TENANT_ID || userRole === "master");
  } catch (error) {
    console.error("Erro ao verificar acesso ao tenant:", error);
    return false;
  }
}
