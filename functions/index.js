// /functions/index.js  (ESM – Node 18)
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

try { admin.app(); } catch { admin.initializeApp(); }

/* =============== CORS / Helpers =============== */
const ALLOWED_ORIGINS = [
  'https://app.unikor.com.br',
  'https://unikor.vercel.app',     // mantenha se usa staging
  'http://localhost:5173',         // dev local (opcional)
  'http://localhost:3000'
];

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  return origin;
}

function handlePreflight(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'UNIKOR/1.0' } });
  const ct = r.headers.get('content-type') || '';
  const body = await r.text();
  return { status: r.status, contentType: ct, body };
}

/* =============== Rotas HTTP =============== */

/**
 * POST /nfceProxy
 * body: { url: "https://dfe-portal...." }
 * -> Faz proxy da página/HTML da NFC-e para contornar CORS no browser.
 */
export const nfceProxy = functions
  .region('southamerica-east1')
  .https.onRequest(async (req, res) => {
    handlePreflight(req, res);
    applyCors(req, res);

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { url } = body;
      if (!url || !/^https:\/\/[a-z0-9.-]+/i.test(url)) {
        return res.status(400).json({ error: 'URL inválida' });
      }

      const { status, contentType, body: html } = await fetchText(url);
      res.setHeader('Content-Type', contentType || 'text/html; charset=utf-8');
      return res.status(status).send(html);
    } catch (e) {
      console.error('nfceProxy error:', e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });

/**
 * POST /nfe55Proxy
 * body: { url: "https://.../xml" }
 * -> Baixa o XML via backend e retorna como texto (ou usa upload direto no front).
 */
export const nfe55Proxy = functions
  .region('southamerica-east1')
  .https.onRequest(async (req, res) => {
    handlePreflight(req, res);
    applyCors(req, res);

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { url } = body;
      if (!url || !/^https:\/\/[a-z0-9.-]+/i.test(url)) {
        return res.status(400).json({ error: 'URL inválida' });
      }

      const r = await fetch(url, { headers: { 'User-Agent': 'UNIKOR/1.0' } });
      const xml = await r.text();
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.status(r.status).send(xml);
    } catch (e) {
      console.error('nfe55Proxy error:', e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });

/**
 * POST /injetarSessao
 * -> Endpoint compatível com o que seu front já chama.
 *    Hoje só responde OK; se você precisa realmente
 *    criar cookies/sessão, implemente aqui.
 */
export const injetarSessao = functions
  .region('southamerica-east1')
  .https.onRequest(async (req, res) => {
    handlePreflight(req, res);
    applyCors(req, res);

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      // TODO: validar token do usuário se necessário
      // const authHeader = req.headers.authorization;

      return res.json({ ok: true, ts: Date.now() });
    } catch (e) {
      console.error('injetarSessao error:', e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });