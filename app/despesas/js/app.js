import { auth, onAuthUser, getCurrentUser } from '/js/firebase.js';
import { uploadArtifacts } from './drive.js';
import { QRScanner } from './scanner.js';
import { saveCategoria, getCategorias } from './store.js';

// refs
const statusBox = document.getElementById('statusBox');
function logStatus(msg) {
  statusBox.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + statusBox.textContent;
}

// voltar
document.getElementById('btnVoltar').addEventListener('click', () => {
  location.href = '/';
});

// logo também volta
document.getElementById('logoUnikor').addEventListener('click', () => {
  location.href = '/';
});

// usuário logado
onAuthUser(user => {
  const el = document.getElementById('usuarioLogado');
  if (user) el.textContent = `Usuário: ${user.email}`;
  else el.textContent = 'Usuário: —';
});

// preencher categorias já usadas
(async () => {
  const lista = document.getElementById('listaCategorias');
  (await getCategorias()).forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    lista.appendChild(opt);
  });
})();

// adicionar produto
document.body.addEventListener('click', e => {
  if (e.target.classList.contains('btn-add-linha')) {
    const linha = e.target.closest('.produto-linha');
    const clone = linha.cloneNode(true);
    clone.querySelectorAll('input').forEach(i => i.value = '');
    linha.parentNode.appendChild(clone);
  }
});

// salvar manual
document.getElementById('btnSalvarManual').addEventListener('click', async () => {
  const user = getCurrentUser();
  if (!user) { alert('Faça login primeiro'); return; }

  const categoria = document.getElementById('categoriaManual').value || 'GERAL';
  const estab = document.getElementById('estabelecimento').value || '';
  const produtos = [...document.querySelectorAll('.produto-linha')].map(l => ({
    nome: l.querySelector('.produto-nome').value,
    valor: parseFloat(l.querySelector('.produto-valor').value || 0)
  }));

  saveCategoria(categoria);

  // gerar PDF simples
  const { jsPDF } = window.jspdf || await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const doc = new jsPDF();
  doc.text(`Despesa Manual\nUsuário: ${user.email}\nCategoria: ${categoria}\nEstabelecimento: ${estab}`, 10, 10);
  let y = 30;
  produtos.forEach(p => {
    doc.text(`- ${p.nome}: R$ ${p.valor.toFixed(2)}`, 10, y);
    y += 10;
  });
  const blob = doc.output('blob');

  try {
    await uploadArtifacts({
      isoDate: new Date().toISOString(),
      visualBlob: blob,
      visualName: `DespesaManual_${Date.now()}.pdf`
    });
    logStatus('Despesa manual salva com sucesso.');
    alert('Despesa manual salva!');
  } catch (e) {
    console.error(e);
    alert('Erro ao salvar despesa manual.');
  }
});

// NFC-e via URL
document.getElementById('btnProcessarNfce').addEventListener('click', async () => {
  const url = document.getElementById('urlNfce').value.trim();
  if (!url) return alert('Cole a URL da NFC-e');
  logStatus('Processando NFC-e...');

  try {
    const resp = await fetch('/api/nfceProxy', { method: 'POST', body: JSON.stringify({ url }) });
    if (!resp.ok) throw new Error('Falha no proxy');
    const html = await resp.text();

    const blob = new Blob([html], { type: 'application/pdf' });
    await uploadArtifacts({
      isoDate: new Date().toISOString(),
      visualBlob: blob,
      visualName: `NFCe_${Date.now()}.pdf`
    });
    logStatus('NFC-e salva com sucesso.');
  } catch (e) {
    logStatus('Erro ao processar NFC-e.');
    console.error(e);
  }
});

// NFe-55 via XML
document.getElementById('btnProcessarNfe').addEventListener('click', async () => {
  const file = document.getElementById('arquivoNfe').files[0];
  if (!file) return alert('Escolha um XML');
  logStatus('Processando NFe-55...');

  try {
    await uploadArtifacts({
      isoDate: new Date().toISOString(),
      xmlBlob: file,
      xmlName: `NFe55_${Date.now()}.xml`
    });
    logStatus('NFe-55 salva com sucesso.');
  } catch (e) {
    logStatus('Erro ao salvar NFe-55.');
  }
});

// ativar QR Scanner
const scanner = new QRScanner({
  video: document.getElementById('videoQR'),
  onResult: (text) => {
    document.getElementById('urlNfce').value = text;
    logStatus('QR lido: ' + text);
    scanner.stop();
  }
});
scanner.start();