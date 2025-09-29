import { auth, onAuthUser } from './firebase.js';
import { uploadArtifacts } from './drive.js';

document.addEventListener('DOMContentLoaded', () => {
  // back button
  document.getElementById('btnVoltar').addEventListener('click', () => {
    location.href = '/';
  });

  // exibir usuário logado
  onAuthUser(user => {
    const el = document.getElementById('usuarioLogado');
    if (user) el.textContent = `Usuário logado: ${user.email}`;
  });

  // adicionar linha manual
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
    const categoria = document.getElementById('categoriaManual').value || 'GERAL';
    const estab = document.getElementById('estabelecimento').value || '';
    const produtos = [...document.querySelectorAll('.produto-linha')].map(l => ({
      nome: l.querySelector('.produto-nome').value,
      valor: parseFloat(l.querySelector('.produto-valor').value || 0)
    }));

    const payload = {
      tipo: 'manual',
      categoria,
      estabelecimento: estab,
      produtos,
      criadoEm: new Date().toISOString()
    };

    try {
      await uploadArtifacts(payload); // já integrado com Drive
      alert('Despesa manual salva com sucesso!');
    } catch (e) {
      console.error('Erro ao salvar manual:', e);
      alert('Erro ao salvar despesa manual');
    }
  });
});