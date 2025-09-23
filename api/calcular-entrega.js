// portal/api/calcular-entrega.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { enderecoTexto, totalItens, clienteIsento } = req.body || {};
    if (!enderecoTexto || typeof enderecoTexto !== "string") {
      return res.status(400).json({ error: "Campo 'enderecoTexto' é obrigatório (string)" });
    }

    const ISENCAO_MIN = Number(process.env.ISENCAO_MIN || 200); // padrão 200
    const txt = String(enderecoTexto).trim().toUpperCase();

    // Se veio lat,lon por engano, devolve para o front tratar via /portal/api/frete
    const isLatLon = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(txt);
    if (isLatLon) {
      return res.status(400).json({
        error: "Endereço em formato coordenadas deve usar /portal/api/frete",
        hint: "Envie um endereço textual (rua, número, cidade...)"
      });
    }

    // Extrai cidade se existir “, NOME - UF”. Se não houver, assume POA por padrão
    const mCidade = /,\s*([A-ZÀ-Ý'\.\-\s]{2,})\s*-\s*([A-Z]{2})\s*$/.exec(txt);
    const cidade = (mCidade ? mCidade[1] : "PORTO ALEGRE").trim();
    const uf = (mCidade ? mCidade[2] : "RS").trim();

    // Regras simples por cidade
    // ajuste à vontade (valores só de exemplo prático)
    let base = 12; // POA default
    const cidadeKey = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (uf !== "RS") {
      base = 35; // fora RS
    } else if (cidadeKey.includes("PORTO ALEGRE")) {
      base = 12; // POA
    } else if (
      /CANOAS|CACHOEIRINHA|ALVORADA/.test(cidadeKey)
    ) {
      base = 20;
    } else if (/GRAVATAI|VIAMAO/.test(cidadeKey)) {
      base = 22;
    } else {
      base = 25; // demais RS
    }

    // Isenção por checkbox/cliente ou por subtotal
    const isentoByCliente = !!clienteIsento;
    const isentoByValor = Number(totalItens || 0) >= ISENCAO_MIN;

    const isento = isentoByCliente || isentoByValor;
    const valorBase = isento ? 0 : base;
    const labelIsencao = isento
      ? (isentoByCliente ? "(cliente isento)" : `(isento ≥ R$ ${ISENCAO_MIN.toFixed(2)})`)
      : "";

    return res.status(200).json({
      ok: true,
      cidadeDetectada: `${cidade} - ${uf}`,
      regra: isento ? "ISENTO" : "TABELA_CIDADE",
      valorBase,
      valorCobravel: valorBase,
      isento,
      labelIsencao,
      totalItens: Number(totalItens || 0)
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno", detail: e?.message || String(e) });
  }
}