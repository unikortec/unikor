// Parse da URL do QR NFC-e (SVRS e similares)
export function parseNFCe(text){
  try{
    const url = new URL(text);
    const p = url.searchParams.get('p') || '';
    const parts = decodeURIComponent(p).split('|');
    const accessKey = (parts[0] || '').replace(/\D/g,'');
    if (accessKey.length !== 44) return null;
    return { raw: url.toString(), accessKey, model:65 };
  }catch{ return null; }
}
export const shortKey = k => (k && k.length===44) ? `${k.slice(0,8)}…${k.slice(-6)}` : k;
export async function fileToBase64(file){
  const buf = await file.arrayBuffer();
  let binary = ''; new Uint8Array(buf).forEach(b=>binary += String.fromCharCode(b));
  return btoa(binary);
}