// ENTRADA única: app.js
import { parseNFCe, shortKey, fileToBase64 } from './nfce.js';

// ---- Firebase Auth (usa a instância do portal se existir) ----
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// Se você já tem window.UNIKOR_APP (portal/js/firebase.js), reaproveite:
const CONFIG = window.UNIKOR_FIREBASE_CONFIG || {
  apiKey: "AIzaSyC12s4PvUWtNxOlShPc7sXlzq4XWqlVo2w",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.appspot.com",
  messagingSenderId: "329806123621",
  appId: "1:329806123621:web:9aeff2f5947cd106cf2c8c"
};
const app = initializeApp(CONFIG);
const auth = getAuth(app);

// ---- DOM helpers ----
const $ = (s)=>document.querySelector(s);
const categoriaSel = $('#categoria');
const btnScan = $('#btnScan');
const btnFechar = $('#btnFechar');
const btnSalvar = $('#btnSalvar');
const xmlInput = $('#xml55');
const scanArea = $('#scanArea');
const preview = $('#preview');

let UID = null;
let draft = null;     // último documento retornado pela function
let lastFnEndpoint = {
  nfce: 'https://southamerica-east1-unikorapp.cloudfunctions.net/ingestNfceByQr',
  nfe55:'https://southamerica-east1-unikorapp.cloudfunctions.net/ingestNfe55Xml'
};

// ---- Auth flow ----
onAuthStateChanged(auth, async (user)=>{
  if (user){ UID = user.uid; return; }
  await signInAnonymously(auth);
});

// ---- QR scanner (html5-qrcode) ----
let scanner = null;
btnScan.onclick = async ()=>{
  scanArea.hidden = false;
  if (!scanner){
    // @ts-ignore
    scanner = new Html5Qrcode("qrReader");
  }
  try{
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 260 },
      async (decodedText)=>{
        await handleQr(decodedText);
        await stopScanner();
      }
    );
  }catch(e){
    alert('Não foi possível iniciar a câmera.');
  }
};
btnFechar.onclick = stopScanner;
async function stopScanner(){
  if (scanner){ try{ await scanner.stop(); }catch{} }
  scanArea.hidden = true;
}

// ---- XML 55 upload ----
xmlInput.onchange = async (ev)=>{
  const file = ev.target.files?.[0]; if (!file) return;
  if (!UID){ alert('Aguarde autenticação.'); return; }
  const category = categoriaSel.value || 'OUTROS';
  const b64 = await fileToBase64(file);

  const accessKeyGuess = (file.name.match(/\d{44}/)?.[0]) || prompt('Chave de acesso (44 dígitos):') || '';
  if (accessKeyGuess.length !== 44){ alert('Chave inválida.'); return; }

  const r = await fetch(lastFnEndpoint.nfe55, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      uid: UID,
      category,
      accessKey: accessKeyGuess,
      xmlBase64: b64
    })
  });
  if(!r.ok){ alert('Falha ao importar XML 55'); return; }
  const js = await r.json();
  draft = js.doc;
  showPreview(js.doc);
};

// ---- QR handler ----
async function handleQr(text){
  const parsed = parseNFCe(text);
  if (!parsed){ alert('QR NFC-e inválido.'); return; }
  if (!UID){ alert('Aguarde autenticação.'); return; }
  const category = categoriaSel.value || 'OUTROS';

  const r = await fetch(lastFnEndpoint.nfce, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      uid: UID,
      category,
      qrUrl: parsed.raw,
      accessKey: parsed.accessKey
    })
  });
  if(!r.ok){ alert('Falha ao importar NFC-e'); return; }
  const js = await r.json();
  draft = js.doc;
  showPreview(js.doc);
}

function showPreview(doc){
  const lines = [];
  lines.push(`Modelo: ${doc.model}  •  Chave: ${shortKey(doc.accessKey)}`);
  if (doc.emitter?.name) lines.push(`Emitente: ${doc.emitter.name}`);
  if (doc.emitter?.cnpj) lines.push(`CNPJ: ${doc.emitter.cnpj}`);
  if (doc.date) lines.push(`Data: ${doc.date}`);
  if (doc.payment?.amount) lines.push(`Total: R$ ${Number(doc.payment.amount).toFixed(2)}`);
  lines.push('');
  lines.push('Itens:');
  for(const it of (doc.items||[])){
    lines.push(`- ${it.description}  •  ${it.qty} ${it.unit} × ${it.unitPrice?.toFixed?.(2) ?? it.unitPrice} = ${Number(it.lineTotal||0).toFixed(2)}`);
  }
  preview.textContent = lines.join('\n');
}

// ---- Salvar/ajustar (update do doc criado pela function) ----
// Aqui, como a function já grava, o "Salvar" fica para ajustes futuros.
// Você pode estender para editar/atualizar campos do draft no Firestore via REST/SDK.
btnSalvar.onclick = ()=>{
  if (!draft){ alert('Importe uma NFC-e (QR) ou XML 55 primeiro.'); return; }
  alert('Dados importados e salvos. Se quiser, implemento a tela de edição para atualizar o Firestore.');
};