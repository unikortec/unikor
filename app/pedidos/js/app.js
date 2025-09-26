// app/pedidos/js/app.js
import { getCurrentUser, hasAccessToTenant } from './firebase.js';
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

// Verificar acesso ao tenant
async function checkTenantAccess() {
    const hasAccess = await hasAccessToTenant();
    if (!hasAccess) {
        alert('Usuário não tem permissão para acessar este módulo.');
        window.location.href = '/';
        return false;
    }
    return true;
}

// Atualizar informações do usuário no header
function updateUserInfo() {
    const user = getCurrentUser();
    const userDisplayName = document.getElementById('userDisplayName');
    if (user && userDisplayName) {
        userDisplayName.textContent = user.email;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // O auth-guard.js já vai garantir que o usuário esteja logado
    // Aguardar um pouco para garantir que a autenticação foi carregada
    setTimeout(async () => {
        // Verificar se tem acesso ao tenant
        const hasAccess = await checkTenantAccess();
        if (!hasAccess) return;
        
        // Atualizar info do usuário
        updateUserInfo();
        
        // Carregar módulos do app
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
    }, 500);
});
