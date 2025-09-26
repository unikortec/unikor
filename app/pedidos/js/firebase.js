// app/pedidos/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
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

// Estado de autenticação
let currentUser = null;
let userTenantId = null;
let userRole = null;

// Login por e-mail/senha
export async function loginWithEmailPassword(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Obter claims customizados
    const tokenResult = await user.getIdTokenResult(true);
    userTenantId = tokenResult.claims.tenantId;
    userRole = tokenResult.claims.role;
    
    // Verificar se o usuário tem acesso ao tenant correto
    if (userTenantId !== TENANT_ID && userRole !== "master") {
      await signOut(auth);
      throw new Error("Usuário não tem permissão para acessar este tenant.");
    }
    
    currentUser = user;
    return { success: true, user };
  } catch (error) {
    console.error("Erro no login:", error);
    return { success: false, error: error.message };
  }
}

// Logout
export async function logout() {
  try {
    await signOut(auth);
    currentUser = null;
    userTenantId = null;
    userRole = null;
    return { success: true };
  } catch (error) {
    console.error("Erro no logout:", error);
    return { success: false, error: error.message };
  }
}

// Verificar se está logado
export function isLoggedIn() {
  return currentUser !== null;
}

// Obter usuário atual
export function getCurrentUser() {
  return currentUser;
}

// Obter tenant do usuário
export function getUserTenant() {
  return userTenantId;
}

// Obter role do usuário
export function getUserRole() {
  return userRole;
}

// Listener de mudanças de autenticação
onAuthStateChanged(auth, async (user) => {
  if (user && !user.isAnonymous) {
    const tokenResult = await user.getIdTokenResult(true);
    userTenantId = tokenResult.claims.tenantId;
    userRole = tokenResult.claims.role;
    
    // Verificar se tem acesso ao tenant
    if (userTenantId === TENANT_ID || userRole === "master") {
      currentUser = user;
      document.dispatchEvent(new CustomEvent('authStateChanged', { 
        detail: { user, loggedIn: true } 
      }));
    } else {
      await signOut(auth);
      currentUser = null;
      userTenantId = null;
      userRole = null;
      document.dispatchEvent(new CustomEvent('authStateChanged', { 
        detail: { user: null, loggedIn: false } 
      }));
    }
  } else {
    currentUser = null;
    userTenantId = null;
    userRole = null;
    document.dispatchEvent(new CustomEvent('authStateChanged', { 
      detail: { user: null, loggedIn: false } 
    }));
  }
});
