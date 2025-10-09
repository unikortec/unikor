/* ===== Header ===== */
.topbar { background:#0ea5a6; }            /* cor Unikor (ajuste se usar outra) */
.topbar .wrap { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.topbar h1 { 
  margin:0; font-weight:800; letter-spacing:.5px;
  font-size: clamp(18px, 4vw, 24px);       /* “RELATÓRIOS” menor no mobile */
  text-transform: uppercase; text-align:center; flex:1;
}
.topbar .logo { height:22px; }              /* logo menor */
.topbar .user { white-space:nowrap; font-weight:600; }

/* ===== Grid filtros em 2 colunas no mobile ===== */
.filters .grid {
  display:grid; gap:16px;
  grid-template-columns: repeat(2, minmax(0,1fr));
}
.filters .field-wide { grid-column: 1 / -1; }  /* Cliente ocupa linha inteira */
@media (min-width: 900px){
  .filters .grid { grid-template-columns: repeat(4, minmax(0,1fr)); }
}

/* Botões em 2 por linha, mesmo tamanho */
.filters .actions {
  display:grid; gap:14px; margin-top:10px;
  grid-template-columns: repeat(2, minmax(0,1fr));
}
@media (min-width: 900px){
  .filters .actions { grid-template-columns: repeat(4, minmax(0,1fr)); }
}

/* ===== Rodapé fixo compacto (4 colunas) ===== */
.totals-bar {
  position:sticky; bottom:0; z-index:5;
  background:#fff; border:1px solid #e5e7eb; border-radius:16px;
  margin:10px; padding:12px 10px;
  display:grid; gap:6px; align-items:center;
  grid-template-columns: repeat(4, 1fr);
  box-shadow: 0 6px 30px rgba(0,0,0,.08);
}
.totals-bar .k { 
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:4px; min-width:0;
}
.totals-bar .k .label { 
  font-size:12px; font-weight:800; letter-spacing:.4px; color:#6b7280;
  text-transform: uppercase;
}
.totals-bar .k .val {
  font-size:18px; font-weight:800; color:#111827; line-height:1.1;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}

/* Remove quaisquer prefixos "R$" antigos via CSS (se existiam) */
#ftTotal::before, #ftFrete::before { content:none !important; }

/* ===== Botões de ação na tabela ===== */
.btn.icon.btn-cancel { 
  background:#fff; border:1px solid #fca5a5; color:#b91c1c;   /* X vermelho */
}
.btn.icon.btn-cancel:hover { background:#fee2e2; }

/* ===== Acessibilidade: tocar/hover linhas ===== */
.table-wrap table tbody tr:hover{ background:#eef2f7; }
.table-wrap table tbody tr:nth-child(even){ background:#f8fafc; }