// app/pedidos/js/app.js
import { 
  loginWithEmailPassword, 
  logout, 
  isLoggedIn, 
  getCurrentUser 
} from './firebase.js';
import { atualizarFreteUI } from './frete.js';

// Carrega itens.js com fallback (evita crash se SW servir versão antiga)
let initItens, adicionarItem, atualizarFreteAoEditarItem;
async function loadItensModule(){
    const m = await import('./itens.js');
    initItens = m.initItens ?? m.default?.initItens;
    adicionarItem = m.adicionarItem ?? m.default?.adicionarItem;
    atualizarFreteAoEditarItem = m.atualizarFreteAoEditarItem ?? m.default?.atualizarFreteAoEditarItem;
    if (!initItens || !adicionarItem) {
        console.error('[itens.js] exports não encontrados', m);
        alert('Falha ao carregar módulo de itens. Atualize a página.');
        return false;
    }
    return true;
}

// PDF com fallback de tipos de export
async function callGerarPDF(mode, btn) {
    try {
        const m = await import('./pdf.js');
        let fn = null;
        if (typeof m.gerarPDF === 'function') fn = m.gerarPDF;
        else if (typeof m.default === 'function') fn = m.default;
        else if (m.default && typeof m.default.gerarPDF === 'function') fn = m.default.gerarPDF;
        if (!fn) {
            alert('Módulo de PDF indisponível');
            return;
        }
        await fn(mode, btn);
    } catch (err) {
        console.error('[PDF] Falha ao carregar módulo:', err);
        alert('Não consegui carregar o módulo de PDF. Tente recarregar a página.');
    }
}

// UI: mostra/oculta campo "pagamentoOutro"
function wirePagamentoOutro(){
    const sel = document.getElementById('pagamento');
    const outro = document.getElementById('pagamentoOutro');
    if (!sel || !outro) return;
    const sync = () => {
        outro.style.display = (sel.value === 'OUTRO') ? '' : 'none';
    };
    sel.addEventListener('change', sync);
    sync();
}

// Banner offline (ping real)
async function isReallyOnline(timeoutMs = 5000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const url = "/app/pedidos/manifest.json?ts=" + Date.now();
        const r = await fetch(url, { method: "HEAD", cache: "no-store", signal: ctrl.signal });
        return r.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(t);
    }
}

async function updateOfflineBanner(){
    const el = document.getElementById('offlineBanner');
    if (!el) return;
    el.style.display = (await isReallyOnline()) ? 'none' : 'block';
}

// Gerenciamento de telas
function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    if (loginScreen) loginScreen.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
}

function showMainApp() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    if (loginScreen) loginScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
    
    // Atualizar informações do usuário
    const user = getCurrentUser();
    const userDisplayName = document.getElementById('userDisplayName');
    if (user && userDisplayName) {
        userDisplayName.textContent = user.email;
    }
}

// Configurar login
function setupLogin() {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        if (!email || !password) {
            loginError.textContent = 'Por favor, preencha todos os campos.';
            loginError.style.display = 'block';
            return;
        }
        
        loginBtn.disabled = true;
        loginBtn.textContent = 'Entrando...';
        loginError.style.display = 'none';
        
        const result = await loginWithEmailPassword(email, password);
        
        if (result.success) {
            showMainApp();
        } else {
            loginError.textContent = result.error || 'Erro ao fazer login. Verifique suas credenciais.';
            loginError.style.display = 'block';
        }
        
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
    });
}

// Configurar logout
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;
    
    logoutBtn.addEventListener('click', async () => {
        await logout();
        showLoginScreen();
    });
}

// Listener para mudanças de autenticação
document.addEventListener('authStateChanged', (event) => {
    const { loggedIn } = event.detail;
    
    if (loggedIn) {
        showMainApp();
    } else {
        showLoginScreen();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    // Configurar login/logout
    setupLogin();
    setupLogout();
    
    // Verificar se já está logado
    if (isLoggedIn()) {
        showMainApp();
    } else {
        showLoginScreen();
    }
    
    // Carregar módulos do app principal
    const ok = await loadItensModule();
    if (!ok) return;
    
    initItens();
    
    const addBtn = document.getElementById('adicionarItemBtn');
    if (addBtn){
        addBtn.addEventListener('click', () => {
            adicionarItem();
            atualizarFreteUI();
        });
    }
    
    const end = document.getElementById('endereco');
    const chkIsentar = document.getElementById('isentarFrete');
    end && end.addEventListener('blur', atualizarFreteUI);
    chkIsentar && chkIsentar.addEventListener('change', atualizarFreteUI);
    
    atualizarFreteAoEditarItem(() => atualizarFreteUI());
    
    wirePagamentoOutro();
    
    const g = document.getElementById('btnGerarPdf');
    const s = document.getElementById('btnSalvarPdf');
    const c = document.getElementById('btnCompartilharPdf');
    g && g.addEventListener('click', (ev) => callGerarPDF(false, ev.target));
    s && s.addEventListener('click', (ev) => callGerarPDF(true, ev.target));
    c && c.addEventListener('click', async () => callGerarPDF('share'));
    
    updateOfflineBanner();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            setTimeout(updateOfflineBanner, 1000);
        }
    });
});
