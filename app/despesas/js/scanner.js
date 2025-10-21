// ===== UNIKOR • Scanner universal (fix ZXing + iOS/PC fallback) =====
let zxing = null;
let reader = null;
let stream = null;

function show(msg) {
  const el = document.getElementById("statusBox");
  if (el) {
    el.classList.remove("hidden");
    el.textContent = msg;
  }
}

// ===== Carrega ZXing de fonte estável =====
async function ensureZXing() {
  if (zxing) return;
  const urls = [
    "https://unpkg.com/@zxing/browser@0.1.5/umd/index.min.js",
    "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/index.min.js"
  ];
  for (const u of urls) {
    try {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = u;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
      if (window.ZXingBrowser) {
        zxing = window.ZXingBrowser;
        console.log("[Scanner] ZXing carregado de:", u);
        return;
      }
    } catch (e) {
      console.warn("[Scanner] Falhou em:", u);
    }
  }
  throw new Error("ZXing não pôde ser carregado");
}

// ===== Obtém câmera traseira ou fallback =====
async function getBackCamera() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
  } catch {}
  const devices = await navigator.mediaDevices.enumerateDevices();
  const backs = devices.filter(
    (d) => d.kind === "videoinput" && /back|rear|traseira|environment/i.test(d.label)
  );
  if (backs.length) return { deviceId: { exact: backs[0].deviceId } };
  return { facingMode: { ideal: "environment" } };
}

// ===== Inicia leitura =====
export async function startScan({ onResult } = {}) {
  const modal = document.getElementById("scanModal");
  const video = document.getElementById("scanVideo");
  const fallbackDiv = document.getElementById("scanPhoto");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      show("Navegador não suporta câmera. Use o modo foto.");
      openFallback(onResult);
      return;
    }

    await ensureZXing();

    modal.classList.remove("hidden");
    fallbackDiv.classList.add("hidden");
    video.classList.remove("hidden");

    video.setAttribute("autoplay", "");
    video.setAttribute("playsinline", "");
    video.muted = true;

    const cam = await getBackCamera();
    stream = await navigator.mediaDevices.getUserMedia({ video: cam });
    video.srcObject = stream;

    reader = new zxing.BrowserMultiFormatReader();
    reader.decodeFromVideoElementContinuously(video, (res, err) => {
      if (res?.text) {
        const raw = res.text;
        const chave = (raw.match(/[?&]p=([^|&]+)/i)?.[1] || raw)
          .replace(/\D/g, "")
          .slice(0, 44);
        stopScan();
        onResult && onResult(chave || raw);
      }
    });
  } catch (err) {
    console.error("[scanner] erro:", err);
    show("Falha ao abrir câmera. Usando modo foto.");
    openFallback(onResult);
  }
}

// ===== Fecha câmera =====
export function stopScan() {
  try {
    reader?.reset();
  } catch {}
  try {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  } catch {}
  document.getElementById("scanModal")?.classList.add("hidden");
}

// ===== Fallback: leitura por foto =====
function openFallback(onResult) {
  const modal = document.getElementById("scanModal");
  const video = document.getElementById("scanVideo");
  const fallbackDiv = document.getElementById("scanPhoto");
  modal.classList.remove("hidden");
  video.classList.add("hidden");
  fallbackDiv.classList.remove("hidden");

  let fileInput = document.getElementById("fileQr");
  if (!fileInput) {
    fileInput = document.createElement("input");
    fileInput.id = "fileQr";
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.capture = "environment";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);
  }

  const btn = document.getElementById("btnTakePhoto");
  btn.onclick = () => fileInput.click();

  fileInput.onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    show("Processando imagem...");
    await ensureZXing();
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((r) => (img.onload = r));

    try {
      const result = await zxing.BrowserMultiFormatReader.decodeFromImageElement(img);
      if (result?.text) {
        const raw = result.text;
        const chave = (raw.match(/[?&]p=([^|&]+)/i)?.[1] || raw)
          .replace(/\D/g, "")
          .slice(0, 44);
        stopScan();
        onResult && onResult(chave || raw);
      } else {
        show("Não foi possível ler o QR. Tente outra foto.");
      }
    } catch {
      show("Erro ao processar imagem.");
    }
  };
}