import { onAuthUser, getCurrentUser } from './firebase.js';
import { uploadArtifacts } from './drive.js';

// back
document.getElementById('btnVoltar').addEventListener('click', () => {
  location.href = '/';
});

// auth → mostra email
onAuthUser(user => {
  const el = document.getElementById('usuarioLogado');
  if (user) {
    el.textContent = `Usuário logado: ${user.email}`;
  } else {
    el.textContent = 'Usuário: —';
  }
});

// adicionar linhas
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
  if (!user) return alert('Faça login antes de salvar');

  const categoria = document.getElementById('categoriaManual').value || 'GERAL';
  const estab = document.getElementById('estabelecimento').value || '';
  const produtos = [...document.querySelectorAll('.produto-linha')].map(l => ({
    nome: l.querySelector('.produto-nome').value,
    valor: parseFloat(l.querySelector('.produto-valor').value || 0)
  }));

  const isoDate = new Date().toISOString();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text(`Despesa Manual - ${categoria}`, 10, 10);
  doc.text(`Usuário: ${user.email}`, 10, 20);
  doc.text(`Estabelecimento: ${estab}`, 10, 30);

  let y = 50, total = 0;
  produtos.forEach(p => {
    doc.text(`${p.nome} - R$ ${p.valor.toFixed(2)}`, 10, y);
    total += p.valor;
    y += 10;
  });
  doc.text(`TOTAL: R$ ${total.toFixed(2)}`, 10, y+10);

  const pdfBlob = doc.output('blob');
  try {
    await uploadArtifacts({
      isoDate,
      visualBlob: pdfBlob,
      visualName: `MANUAL_${categoria}_${Date.now()}.pdf`
    });
    alert('Despesa manual salva no Drive!');
  } catch (e) {
    console.error(e);
    alert('Erro ao salvar no Drive');
  }
});