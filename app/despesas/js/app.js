// usa o app/auth central via proxy local (não reinicializa Firebase)
import { app, auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

/* ====== CONFIG ====== */
// endpoint das Cloud Functions (pode sobrescrever em window.FUNCTIONS_BASE)
const FUNCTIONS_BASE =
  window.FUNCTIONS_BASE || "https://southamerica-east1-unikorapp.cloudfunctions.net";

/* ====== STATE DE LOGIN ====== */
let UID = null;
let UNAME = null;

onAuthStateChanged(auth, async (user)=>{
  if (user){
    UID   = user.uid;
    UNAME = user.displayName || user.email || "Usuário";
    return;
  }
  // fallback anônimo (só para dev; em prod vamos exigir login)
  await signInAnonymously(auth);
});

/* ====== HELPERS ====== */
// extrai a chave de acesso da URL de QRCode de NFC-e (modelo 65)
function extractAccessKeyFromQrUrl(url){
  try{
    const u = new URL(url);
    // padrão SVRS/SEFAZ: p=<chave>|<...>
    const p = u.searchParams.get("p");
    if (p && /^\d{44}/.test(p)) return p.slice(0,44);
    // fallback: tenta varrer
    const m = decodeURIComponent(u.search).match(/(\d{44})/);
    return m ? m[1] : "";
  }catch{ return ""; }
}

// “slug” curto da chave (final)
function shortKey(ch){ return ch ? ch.slice(-6) : ""; }

// converte File para base64
function fileToBase64(file){
  return new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(String(r.result).split(",")[1] || "");
    r.onerror= rej;
    r.readAsDataURL(file);
  });
}

// UI helpers
const $ = (s)=>document.querySelector(s);
const out = (msg)=>{
  const el = $("#outMsg");
  if (el) el.textContent = msg;
  console.log(msg);
};

/* ====== NFC-e (modelo 65) via QR URL ====== */
$("#btnQrIngest")?.addEventListener("click", async ()=>{
  try{
    const qrUrl   = ($("#inpQr")?.value || "").trim();
    const category= ($("#inpCat")?.value || "").trim().toUpperCase() || "GERAL";
    if (!qrUrl) { alert("Cole a URL do QRCode (NFC-e)."); return; }
    if (!UID)   { alert("Aguarde autenticação..."); return; }

    const accessKey = extractAccessKeyFromQrUrl(qrUrl);
    if (!/^\d{44}$/.test(accessKey)) {
      alert("Não consegui extrair a chave de acesso (44 dígitos) desta URL.");
      return;
    }

    out("Processando NFC-e…");

    const resp = await fetch(`${FUNCTIONS_BASE}/ingestNfceByQr`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        uid: UID,
        userName: UNAME,
        category,
        qrUrl,
        accessKey
      })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    out(`NFC-e salva: ${data.docId} (R$ ${data?.doc?.totals?.amount ?? "0"})`);
    alert(`Salvo: ${shortKey(accessKey)} em ${category}`);
  }catch(e){
    console.error(e);
    alert("Falha ao processar NFC-e.");
    out("Erro NFC-e.");
  }
});

/* ====== NFe (modelo 55) via XML ====== */
$("#btnXmlIngest")?.addEventListener("click", async ()=>{
  try{
    const f = $("#inpXml")?.files?.[0];
    const category= ($("#inpCat")?.value || "").trim().toUpperCase() || "GERAL";
    if (!f)   { alert("Selecione o XML da NFe (modelo 55)."); return; }
    if (!UID) { alert("Aguarde autenticação..."); return; }

    // tentativa simples de achar chave na primeira leitura do arquivo (nome/conteúdo)
    let accessKeyGuess = (f.name.match(/\d{44}/) || [])[0] || "";
    const xmlBase64 = await fileToBase64(f);

    out("Processando NFe 55…");

    const resp = await fetch(`${FUNCTIONS_BASE}/ingestNfe55Xml`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        uid: UID,
        userName: UNAME,
        category,
        accessKey: accessKeyGuess || null,
        xmlBase64
      })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    out(`NFe-55 salva: ${data.docId} (R$ ${data?.doc?.totals?.amount ?? "0"})`);
    alert(`Salvo: ${shortKey(accessKeyGuess || data?.doc?.accessKey)} em ${category}`);
  }catch(e){
    console.error(e);
    alert("Falha ao processar NFe 55.");
    out("Erro NFe 55.");
  }
});