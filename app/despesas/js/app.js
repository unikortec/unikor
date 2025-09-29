// app/despesas/js/app.js
import { initDrive, saveManualDespesaToDrive } from './drive.js';
import { store } from './store.js';

const CLIENT_ID = "329806123621-p2ttq9g7th9fdul74u6t7gntla0q2gcm.apps.googleusercontent.com";

let googleUser = null;

function initGoogleAuth() {
  return new Promise((resolve, reject) => {
    gapi.load('auth2', () => {
      gapi.auth2.init({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file profile email'
      }).then(() => {
        const auth2 = gapi.auth2.getAuthInstance();
        if (auth2.isSignedIn.get()) {
          googleUser = auth2.currentUser.get();
          const name = googleUser.getBasicProfile().getGivenName();
          store.setUser(name);
          updateUserUI(name);
          resolve(googleUser);
        } else {
          auth2.signIn().then(u => {
            googleUser = u;
            const name = u.getBasicProfile().getGivenName();
            store.setUser(name);
            updateUserUI(name);
            resolve(u);
          }).catch(reject);
        }
      });
    });
  });
}

async function getGoogleAccessToken() {
  if (!googleUser) await initGoogleAuth();
  return googleUser.getAuthResponse().access_token;
}

function updateUserUI(name) {
  const el = document.getElementById('usuarioLogado');
  if (el) el.textContent = `Usuário: ${name || '—'}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  // back
  document.getElementById('btnVoltar').addEventListener('click', () => location.href = '/');

  // restaurar nome salvo
  const saved = store.getUser();
  if (saved) updateUserUI(saved);

  // salvar manual
  document.getElementById('btnSalvarManual').addEventListener('click', async () => {
    try {
      await initGoogleAuth();
      await initDrive(getGoogleAccessToken);

      const categoria = document.getElementById('categoriaManual').value || 'GERAL';
      const estabelecimento = document.getElementById('estabelecimento').value || '';
      const produtos = [...document.querySelectorAll('.produto-linha')].map(l => ({
        nome: l.querySelector('.produto-nome').value,
        valor: parseFloat(l.querySelector('.produto-valor').value || 0)
      }));

      await saveManualDespesaToDrive({
        categoria,
        estabelecimento,
        produtos,
        criadoEm: new Date().toISOString()
      });

      alert('Despesa manual salva no Google Drive!');
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar despesa');
    }
  });

  // add linha produto
  document.body.addEventListener('click', e => {
    if (e.target.classList.contains('btn-add-linha')) {
      const linha = e.target.closest('.produto-linha');
      const clone = linha.cloneNode(true);
      clone.querySelectorAll('input').forEach(i => i.value = '');
      linha.parentNode.insertBefore(clone, linha.nextSibling);
    }
  });
});