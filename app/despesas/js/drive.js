// portal/apps/despesas/js/drive.js

const ROOT_FOLDER_ID = '15pbKqQ6Bhou6fz8O85-BC6n4ZglmL5bb'; // App Despesas (sua pasta)
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let gapiReady = false;

export async function initDrive(getGoogleAccessToken) {
  if (!gapiReady) {
    await new Promise((res) => gapi.load('client', res));
    await gapi.client.init({ discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] });
    gapiReady = true;
  }
  const token = await getGoogleAccessToken(DRIVE_SCOPE);
  gapi.client.setToken({ access_token: token });
}

async function ensureFolder(name, parentId) {
  const q = `name='${name.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const { result } = await gapi.client.drive.files.list({ q, fields: 'files(id,name)' });
  if (result.files?.length) return result.files[0].id;
  const { result: created } = await gapi.client.drive.files.create({
    fields: 'id',
    resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }
  });
  return created.id;
}

function ptBrMonth(isoDate) {
  const dt = new Date(isoDate);
  return dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
           .toLowerCase()
           .replace(' de ', ' - ');
}

async function ensureMonthSubfolders(isoDate) {
  const monthName = ptBrMonth(isoDate);
  const monthId = await ensureFolder(monthName, ROOT_FOLDER_ID);
  const pdfId   = await ensureFolder('PDF', monthId);
  const xmlId   = await ensureFolder('XML', monthId);
  return { monthId, pdfId, xmlId };
}

export async function uploadBlobToDrive({ blob, filename, folderId, mimeType }) {
  const metadata = { name: filename, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob, filename);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + gapi.client.getToken().access_token },
    body: form
  });
  if (!res.ok) throw new Error('Falha ao enviar arquivo ao Drive');
  return res.json(); // { id }
}

export async function uploadArtifacts({ isoDate, visualBlob, visualName, xmlBlob, xmlName }) {
  const { pdfId, xmlId } = await ensureMonthSubfolders(isoDate);
  const out = {};
  if (visualBlob) {
    out.visual = await uploadBlobToDrive({ blob: visualBlob, filename: visualName, folderId: pdfId, mimeType: visualBlob.type });
  }
  if (xmlBlob) {
    out.xml = await uploadBlobToDrive({ blob: xmlBlob, filename: xmlName, folderId: xmlId, mimeType: 'text/xml' });
  }
  return out;
}