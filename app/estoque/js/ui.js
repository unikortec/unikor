// app/estoque/js/ui.js
import { $, fmt3 } from "./constants.js";
import {
  FAMILIAS,
  PADROES,
  ensureCatalogEntry,
  ensureSessaoEntry,
  getSessao,
  setSessaoKg,
  editBothKg,
  clearItem,
  deleteIfCustom,
  resumoTexto,
} from "./catalog.js";
import { gerarModeloConfigXLSX, importarConfigXLS } from "./prices.js";
import { catalogo, ultimo } from "./store.js";
import { fbFetchAllInventory } from "./firebase.js";

let termoBusca = "";

export async function bootFromFirestoreIfNeeded() {
  // Mantém a UI independente do Firestore: só tenta popular "ultimo" se estiver vazio
  try {
    if (!ultimo.value) {
      const docs = await fbFetchAllInventory();
      const snapData = {};
      for (const d of docs) {
        const fam = String(d.family || "").toUpperCase();
        const prod = String(d.product || "").toUpperCase();
        if (!fam || !prod) continue;
        const rk = +d.resfriado_kg || 0;
        const ck = +d.congelado_kg || 0;
        if (rk > 0 || ck > 0) {
          snapData[fam] ??= {};
          snapData[fam][prod] = {
            RESFRIADO_KG: rk,
            CONGELADO_KG: ck,
            SUM_KG: +(rk + ck),
          };
        }
      }
      if (Object.keys(snapData).length) {
        ultimo.value = {
          dateISO: new Date().toISOString(),
          dateLabel: "",
          data: snapData,
        };
        localStorage.setItem(
          "estoque_v3_last_report",
          JSON.stringify(ultimo.value)
        );
      }
    }
  } catch (e) {
    console.warn("Boot Firestore (ignorado):", e);
  }
}

export function mountUI() {
  const buscaEl = $("#busca");
  if (buscaEl) {
    buscaEl.addEventListener("input", (e) => {
      termoBusca = (e.target.value || "").trim().toUpperCase();
      render();
    });
  }

  // upload/modelo
  const uploadBtn = $("#btnPrecoUpload");
  if (uploadBtn) {
    const inputUpload = document.createElement("input");
    inputUpload.type = "file";
    inputUpload.accept = ".xlsx,.xls";
    inputUpload.style.display = "none";
    document.body.appendChild(inputUpload);

    uploadBtn.onclick = async () => {
      const querModelo = confirm(
        "OK para baixar o modelo de preços e mínimos.\nCancelar para enviar uma planilha."
      );
      if (querModelo) {
        const blob = gerarModeloConfigXLSX(FAMILIAS);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `MODELO_CONFIG_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        inputUpload.click();
      }
    };
    inputUpload.onchange = async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const ok = await importarConfigXLS(file, ensureCatalogEntry);
        alert(`${ok} item(ns) configurado(s).`);
        render();
      } catch (e) {
        console.error(e);
        alert("Falha ao processar a planilha.");
      } finally {
        inputUpload.value = "";
      }
    };
  }
}

export function render() {
  const app = $("#app");
  if (!app) {
    console.warn("Container #app não encontrado");
    return;
  }
  app.innerHTML = "";

  // Monta cards das famílias sempre usando FAMILIAS como fonte primária (catálogo pode estar vazio)
  FAMILIAS.forEach((fam, idx) => {
    const card = document.createElement("section");
    card.className = `card fam-${idx}`;
    const head = document.createElement("div");
    head.className = "fam-head";
    const title = document.createElement("div");
    title.className = "fam-title";
    title.textContent = fam.nome;

    // contagem preenchidos considera itens do catálogo + padrões
    const itensFamilia = Object.keys(catalogo[fam.nome] || {});
    const preenchidos = itensFamilia.filter((p) => {
      const v = getSessao(fam.nome, p);
      return v.RESFRIADO_KG > 0 || v.CONGELADO_KG > 0;
    }).length;
    const meta = document.createElement("div");
    meta.className = "fam-meta";
    meta.textContent = `${preenchidos}/${Math.max(
      itensFamilia.length,
      fam.itens.length
    )} item(ns) preenchidos`;

    const body = document.createElement("div");
    body.className = "fam-body";
    const ordenados = [...new Set([...fam.itens, ...Object.keys(catalogo[fam.nome] || {})])].sort();

    for (const p of ordenados) {
      const row = linhaProduto(fam.nome, p);
      if (row) body.appendChild(row);
    }
    body.appendChild(document.createElement("div")).className = "divider";
    body.appendChild(blocoNovaLinhaProduto(fam.nome));

    head.append(title, meta);
    card.append(head, body);
    app.appendChild(card);
  });
}

function linhaProduto(fam, prod) {
  ensureCatalogEntry(fam, prod);
  if (termoBusca && !String(prod).toUpperCase().includes(termoBusca)) return null;

  const wrap = document.createElement("div");
  wrap.className = "row";

  const nome = document.createElement("div");
  nome.className = "name";
  nome.innerHTML = `<strong>${prod}:</strong>`;

  const last = document.createElement("div");
  last.className = "last";
  const prev = ultimo.value?.data?.[fam]?.[prod];
  if (prev) {
    const rk = fmt3(prev.RESFRIADO_KG || 0);
    const ck = fmt3(prev.CONGELADO_KG || 0);
    last.textContent = `Última: RESF ${rk} kg | CONG ${ck} kg`;
  } else {
    last.textContent = "Última: —";
  }

  // chips
  const chips = document.createElement("div");
  chips.className = "chips";
  const cR = document.createElement("div");
  cR.className = "chip active";
  cR.textContent = "RESFRIADO";
  const cC = document.createElement("div");
  cC.className = "chip";
  cC.textContent = "CONGELADO";
  let tipo = "RESFRIADO";
  cR.onclick = () => {
    tipo = "RESFRIADO";
    cR.classList.add("active");
    cC.classList.remove("active");
  };
  cC.onclick = () => {
    tipo = "CONGELADO";
    cC.classList.add("active");
    cR.classList.remove("active");
  };
  chips.append(cR, cC);

  // qty
  const qty = document.createElement("div");
  qty.className = "qty";
  const inp = document.createElement("input");
  inp.type = "number";
  inp.step = "0.001";
  inp.min = "0";
  inp.placeholder = "KG";
  const btnAdd = document.createElement("button");
  btnAdd.className = "btn";
  btnAdd.textContent = "Adicionar";
  qty.append(inp, btnAdd);

  // result + actions
  const res = document.createElement("div");
  res.className = "result";
  const numbers = document.createElement("div");
  numbers.className = "numbers";
  numbers.textContent = resumoTexto(fam, prod);

  const actions = document.createElement("div");
  actions.className = "actions";
  const btnEdit = document.createElement("button");
  btnEdit.className = "btn xs";
  btnEdit.textContent = "Editar";
  const btnClear = document.createElement("button");
  btnClear.className = "btn xs";
  btnClear.textContent = "Limpar";
  const btnDel = document.createElement("button");
  btnDel.className = "btn xs";
  btnDel.textContent = "Excluir";
  if (PADROES[fam]?.has(prod)) btnDel.style.display = "none";

  actions.append(btnEdit, btnClear, btnDel);
  res.append(numbers, actions);

  btnAdd.onclick = () => {
    const valStr = (inp.value || "").replace(",", ".");
    if (valStr === "") {
      alert("Informe KG.");
      return;
    }
    const v = parseFloat(valStr);
    if (isNaN(v) || v < 0) {
      alert("KG inválido.");
      return;
    }
    setSessaoKg(fam, prod, tipo, v);
    numbers.textContent = resumoTexto(fam, prod);
    inp.value = "";
  };

  btnClear.onclick = () => {
    clearItem(fam, prod);
    numbers.textContent = resumoTexto(fam, prod);
  };

  btnDel.onclick = () => {
    if (confirm("Excluir este produto (apenas se for item personalizado)?")) {
      const ok = deleteIfCustom(fam, prod);
      if (ok) wrap.remove();
      else alert("Este item faz parte do catálogo padrão e não pode ser excluído.");
    }
  };

  btnEdit.onclick = () => {
    const s = getSessao(fam, prod);
    const rk = prompt("Resfriado (KG):", String(s.RESFRIADO_KG).replace(".", ","));
    if (rk === null) return;
    const ck = prompt("Congelado (KG):", String(s.CONGELADO_KG).replace(".", ","));
    if (ck === null) return;
    const rkv = parseFloat(String(rk).replace(",", "."));
    const ckv = parseFloat(String(ck).replace(",", "."));
    if (isNaN(rkv) || isNaN(ckv) || rkv < 0 || ckv < 0) {
      alert("Valores inválidos.");
      return;
    }
    editBothKg(fam, prod, rkv, ckv);
    numbers.textContent = resumoTexto(fam, prod);
  };

  wrap.append(nome, last, chips, qty, res);
  return wrap;
}

function blocoNovaLinhaProduto(fam) {
  const wrap = document.createElement("div");
  wrap.className = "row";
  const nomeInp = document.createElement("input");
  nomeInp.placeholder = "Novo produto (CAIXA ALTA)";
  nomeInp.style.textTransform = "uppercase";
  const last = document.createElement("div");
  last.className = "last";
  last.textContent = "";
  const chips = document.createElement("div");
  chips.className = "chips";
  const cR = document.createElement("div");
  cR.className = "chip active";
  cR.textContent = "RESFRIADO";
  const cC = document.createElement("div");
  cC.className = "chip";
  cC.textContent = "CONGELADO";
  let tipo = "RESFRIADO";
  cR.onclick = () => {
    tipo = "RESFRIADO";
    cR.classList.add("active");
    cC.classList.remove("active");
  };
  cC.onclick = () => {
    tipo = "CONGELADO";
    cC.classList.add("active");
    cR.classList.remove("active");
  };
  chips.append(cR, cC);

  const qty = document.createElement("div");
  qty.className = "qty";
  const inp = document.createElement("input");
  inp.type = "number";
  inp.step = "0.001";
  inp.min = "0";
  inp.placeholder = "KG";
  const btnAdd = document.createElement("button");
  btnAdd.className = "btn";
  btnAdd.textContent = "Adicionar";
  qty.append(inp, btnAdd);

  const res = document.createElement("div");
  res.className = "result";
  res.textContent = "";

  btnAdd.onclick = () => {
    const prod = (nomeInp.value || "").trim().toUpperCase();
    if (!prod) {
      alert("Digite o nome do produto.");
      return;
    }
    const valStr = (inp.value || "").replace(",", ".");
    if (valStr === "") {
      alert("Informe KG.");
      return;
    }
    const v = parseFloat(valStr);
    if (isNaN(v) || v < 0) {
      alert("KG inválido.");
      return;
    }

    ensureCatalogEntry(fam, prod);
    ensureSessaoEntry(fam, prod);
    if (tipo === "RESFRIADO")
      editBothKg(fam, prod, v, getSessao(fam, prod).CONGELADO_KG);
    else editBothKg(fam, prod, getSessao(fam, prod).RESFRIADO_KG, v);

    const cur = getSessao(fam, prod);
    res.textContent = `${prod}: Resfriado ${fmt3(
      cur.RESFRIADO_KG
    )} kg | Congelado ${fmt3(cur.CONGELADO_KG)} kg`;
    nomeInp.value = "";
    inp.value = "";

    // injeta linha real acima do bloco
    const before = linhaProduto(fam, prod);
    if (before) wrap.parentElement.insertBefore(before, wrap);
  };

  wrap.append(nomeInp, last, chips, qty, res);
  return wrap;
}
