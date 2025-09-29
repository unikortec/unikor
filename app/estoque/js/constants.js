export const APP_VERSION = "1.0.3";

export const $ = (s) => document.querySelector(s);
export const fmt3 = (n) =>
  (Math.round((+n || 0) * 1000) / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
export const round3 = (n) => Math.round((+n || 0) * 1000) / 1000;
export const pad2 = (n) => String(n).padStart(2, "0");
export const dtLabel = (d = new Date()) =>
  `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
export const dtFile = (d = new Date()) =>
  `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${String(
    d.getFullYear()
  ).padStart(4, "0")}`;
export const brl = (v) =>
  (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const STORAGE_KEY = "estoque_v3_catalogo";
export const LAST_REPORT_KEY = "estoque_v3_last_report";
export const PRICE_DB_KEY = "estoque_v3_precos";
export const SESSION_KEY = "estoque_v3_sessao";

export const loadJSON = (k, f) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? f; }
  catch { return f; }
};
export const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));