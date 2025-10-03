// /app/pedidos/js/drive-pedidos.js
// Estrutura final: <ROOT>/PEDIDOS/<DD-MM-AA>/<arquivo.pdf>

const ROOT_FOLDER_ID = '15pbKqQ6Bhou6fz8O85-BC6n4ZglmL5bb'; // raiz fornecida
const DRIVE_SCOPE    = 'https://www.googleapis.com/auth/drive.file';

let gapiReady = false;

export async function initDrivePedidos(getGoogleAccessToken) {
  if (!gapiReady) {
    await new Promise((res) => gapi.load('client', res));
    await gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
    gapiReady = true;
  }
  const token = await getGoogleAccessToken(DRIVE_SCOPE);
  gapi.client.setToken({ access_token: token });
}

async function ensureFolder(name, parentId) {
  const safe = String(name || '').replace(/'/g, "\\'");
  const q = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const { result } = await gapi.client.drive.files.list({ q, fields: 'files(id,name)' });
  if (result.files?.length) return result.files[0].id;

  const { result: created } = await gapi.client.drive.files.create({
    fields: 'id',
    resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
  });
  return created.id;
}

async function ensureRootPedidos() {
  return ensureFolder('PEDIDOS', ROOT_FOLDER_ID);
}

function ddmmaaFromISO(iso) {
  if (!iso) {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const aa = String(d.getFullYear()).slice(-2);
    return `${dd}-${mm}-${aa}`;
  }
  const [y,m,d] = String(iso).split('-');
  return `${String(d||'').padStart(2,'0')}-${String(m||'').padStart(2,'0')}-${String(y||'').slice(-2)}`;
}

async function ensureDayFolder(isoDate) {
  const rootPedidosId = await ensureRootPedidos();
  const dayName = ddmmaaFromISO(isoDate);
  return ensureFolder(dayName, rootPedidosId);
}

async function uploadBlobToDrive({ blob, filename, folderId }) {
  const metadata = { name: filename, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob, filename);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + gapi.client.getToken().access_token },
      body: form,
    }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Falha ao enviar PDF ao Drive: ' + t);
  }
  return res.json(); // { id, name, webViewLink }
}

export async function uploadPedidoPDF({ blob, filename, isoDate }) {
  const folderId = await ensureDayFolder(isoDate);
  return uploadBlobToDrive({ blob, filename, folderId });
}