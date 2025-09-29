// app/despesas/js/drive.js
// Estrutura: /<mês>/<Tipo>/<Categoria>/arquivos

const ROOT_FOLDER_ID = '15pbKqQ6Bhou6fz8O85-BC6n4ZglmL5bb'; // raiz "App Despesas"
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let gapiReady = false;

export async function initDrive(getGoogleAccessToken) {
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

/* ------------------- helpers de pasta ------------------- */
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

function ptBrMonth(isoDate) {
  const dt = isoDate ? new Date(isoDate) : new Date();
  return dt
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .toLowerCase()
    .replace(' de ', ' - ');
}

async function ensureMonthRoot(isoDate) {
  const monthName = ptBrMonth(isoDate);
  return ensureFolder(monthName, ROOT_FOLDER_ID);
}

async function ensureTipoCategoria(monthFolderId, tipo, categoria) {
  const tipoId = await ensureFolder(tipo, monthFolderId); // NFCe | Manuais | NFe55
  const cat = (categoria || 'GERAL').toUpperCase();
  const catId = await ensureFolder(cat, tipoId);
  return catId;
}

/* ------------------- upload genérico ------------------- */
export async function uploadBlobToDrive({ blob, filename, folderId, mimeType }) {
  const metadata = { name: filename, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob, filename);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + gapi.client.getToken().access_token },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Falha ao enviar arquivo ao Drive: ' + t);
  }
  return res.json(); // { id }
}

/* ------------------- API para NFCe/NFe55 (PDF/XML) ------------------- */
export async function uploadArtifacts({ isoDate, visualBlob, visualName, xmlBlob, xmlName, tipo, categoria }) {
  // tipo: 'NFCe' ou 'NFe55'
  const monthId = await ensureMonthRoot(isoDate);
  const folderId = await ensureTipoCategoria(monthId, tipo || 'NFCe', categoria);

  const out = {};
  if (visualBlob) {
    out.visual = await uploadBlobToDrive({
      blob: visualBlob,
      filename: visualName,
      folderId,
      mimeType: visualBlob.type,
    });
  }
  if (xmlBlob) {
    out.xml = await uploadBlobToDrive({
      blob: xmlBlob,
      filename: xmlName,
      folderId,
      mimeType: 'text/xml',
    });
  }
  return out;
}

/* ------------------- API para Despesa Manual ------------------- */
function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 40);
}
function tsParts(d = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return {
    yyyy: d.getFullYear(),
    mm: p(d.getMonth() + 1),
    dd: p(d.getDate()),
    HH: p(d.getHours()),
    MM: p(d.getMinutes()),
  };
}

export async function saveManualDespesaToDrive({ categoria, estabelecimento, produtos, criadoEm }) {
  const when = criadoEm ? new Date(criadoEm) : new Date();
  const { yyyy, mm, dd, HH, MM } = tsParts(when);
  const cat = (categoria || 'GERAL').toUpperCase();
  const estabSlug = slug(estabelecimento || 'SEM-ESTAB');

  // pasta: /<mês>/Manuais/<CATEGORIA>/
  const monthId = await ensureMonthRoot(when.toISOString());
  const folderId = await ensureTipoCategoria(monthId, 'Manuais', cat);

  // Arquivo 1: JSON “bruto”
  const jsonName = `MANUAL_${cat}_${yyyy}-${mm}-${dd}_${HH}${MM}_${estabSlug}.json`;
  const jsonBlob = new Blob([JSON.stringify({ categoria: cat, estabelecimento, produtos, criadoEm: when.toISOString() }, null, 2)], {
    type: 'application/json',
  });

  // Arquivo 2: TXT “visual”
  const total = (produtos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const lines = [
    `DESPESA MANUAL • ${cat}`,
    `DATA: ${dd}/${mm}/${String(yyyy).slice(-2)} ${HH}:${MM}`,
    `ESTABELECIMENTO: ${estabelecimento || '-'}`,
    '',
    'ITENS:',
    ...(produtos || []).map((p) => ` - ${p.nome || '-'}  R$ ${(Number(p.valor) || 0).toFixed(2)}`),
    '',
    `TOTAL: R$ ${total.toFixed(2)}`,
  ].join('\n');
  const txtName = `MANUAL_${cat}_${yyyy}-${mm}-${dd}_${HH}${MM}_${estabSlug}.txt`;
  const txtBlob = new Blob([lines], { type: 'text/plain;charset=utf-8' });

  const out = {};
  out.json = await uploadBlobToDrive({ blob: jsonBlob, filename: jsonName, folderId, mimeType: 'application/json' });
  out.txt = await uploadBlobToDrive({ blob: txtBlob, filename: txtName, folderId, mimeType: 'text/plain' });
  return out;
}