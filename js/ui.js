// /js/ui.js — UNIKOR UI (v2)

export const Theme = {
  // verdes
  brand: "#1e7f46",
  brand600: "#166736",
  brand700: "#0f5a2e",
  // neutros
  white: "#ffffff",
  line: "rgba(255,255,255,.9)",    // linhas brancas no dashboard
  ink:  "#0f1b16",
  muted:"#8fb9a1",
  // gradiente principal
  gradA: "#1b7b42",
  gradB: "#0f6c3a"
};

/* ========== BASE ========== */
export function injectBaseStyles(){
  const css = `
  :root{
    --brand:${Theme.brand}; --brand-600:${Theme.brand600}; --brand-700:${Theme.brand700};
    --white:${Theme.white}; --ink:${Theme.ink}; --muted:${Theme.muted};
    --line:${Theme.line}; --gradA:${Theme.gradA}; --gradB:${Theme.gradB};
  }
  *{box-sizing:border-box}
  html,body{height:100%; margin:0; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}
  img{display:block; max-width:100%}
  button{font:inherit}
  a{color:inherit}

  /* Screens */
  .screen{ display:none; min-height:100dvh; }
  .screen.active{ display:block; }
  .container{ max-width:980px; margin:0 auto; padding:24px; }

  /* ===== LOGIN ===== */
  #scrLogin{
    background: linear-gradient(145deg,var(--gradA),var(--gradB));
    color:var(--white);
    display:flex; align-items:center; justify-content:center;
    padding:32px 18px;
  }
  .login-card{
    width:min(720px, 100%);
    background:transparent;                 /* tudo verde conforme mock */
    border-radius:28px;
    padding:0 18px 28px;
  }
  .login-logo{
    width:160px; height:160px; margin:0 auto 8px;
    background: url("./assets/logo/unikor-logo.png") center/cover no-repeat;
    border-radius:12px;
    box-shadow:0 8px 18px rgba(0,0,0,.22);
  }
  .login-title{
    text-align:center; font-size:42px; font-weight:900; letter-spacing:.5px; margin:8px 0 24px; color:var(--white);
    text-shadow:0 2px 0 rgba(0,0,0,.15);
  }

  label{font-weight:800; display:block; margin:14px 0 8px; color:var(--white)}
  input{
    width:100%; border-radius:14px; border:0; outline:0;
    padding:14px 16px; font-size:18px;
    background: rgba(255,255,255,.92); color:#123;
  }
  input::placeholder{ color:#6f8a7c; font-weight:600; }

  .btn{
    width:100%; margin-top:18px; border:0; border-radius:18px; cursor:pointer;
    padding:16px 18px; font-weight:900; font-size:22px; letter-spacing:.2px;
    background: var(--brand); color:var(--white);
    box-shadow:0 14px 26px rgba(0,0,0,.28);
    transition: transform .06s ease, background .2s ease;
  }
  .btn:active{ transform:translateY(2px); }
  .login-muted{
    text-align:center; margin-top:12px; font-weight:800; color:var(--white);
    text-decoration:underline; text-underline-offset:3px;
  }

  /* ===== DASHBOARD ===== */
  #scrDash{
    background: linear-gradient(145deg,var(--gradA),var(--gradB));
    color:var(--white);
  }

  /* Topbar com logo centralizado e Sair pequeno no canto */
  .topbar{
    position:relative; padding:16px 10px 8px; margin-bottom:8px;
  }
  .brand-center{
    display:flex; align-items:center; justify-content:center; gap:14px;
  }
  .brand-mark{ width:46px; height:46px; color:var(--white); }
  .brand-name{ font-size:48px; font-weight:900; letter-spacing:1px; color:var(--white); }

  .btn-logout{
    position:absolute; top:6px; right:10px;
    border:0; border-radius:999px; padding:10px 16px;
    background:rgba(0,0,0,.22); color:#fff; font-weight:900;
    backdrop-filter: blur(6px);
    box-shadow:0 6px 16px rgba(0,0,0,.25);
    cursor:pointer;
  }

  /* Grid 2x3 que CABE NA VIEWPORT (sem scroll) */
  .grid{
    display:grid; grid-template-columns:1fr 1fr; gap:18px;
    /* calcula área visível: viewport - header - padding */
    height: calc(100dvh - 160px);         /* 160 ~ logo+respiro */
    align-content:space-between;          /* distribui linhas */
  }
  /* em telas super pequenas, garante 3 linhas visíveis */
  @media (max-width:420px){
    .grid{ height: calc(100dvh - 150px); gap:14px; }
  }

  .tile{
    border:2.5px solid var(--line);
    border-radius:28px;
    background: transparent;
    color:var(--white);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:14px; text-align:center;
    box-shadow: 0 0 0 rgba(0,0,0,0);
    transition: transform .06s ease, box-shadow .18s ease;
    min-height: 120px;
  }
  .tile:hover{ transform:translateY(-2px); box-shadow:0 10px 24px rgba(0,0,0,.22); }
  .tile svg{ width:54px; height:54px; stroke:var(--white); }
  .tile-title{ font-size:34px; font-weight:900; letter-spacing:.3px; }

  /* FAB Config bonito */
  .fab{
    position:fixed; right:18px; bottom:18px; width:66px; height:66px;
    background:var(--brand); color:#fff; border-radius:999px; display:flex; align-items:center; justify-content:center;
    box-shadow:0 16px 36px rgba(0,0,0,.35), 0 0 0 4px rgba(255,255,255,.75) inset;
    cursor:pointer;
  }
  .fab svg{ width:34px; height:34px; fill:#fff; }

  /* Utilidades */
  .welcome{ display:none } /* não usamos texto de boas-vindas no topo */
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

/* ========== COMPONENTES ========== */
export function renderTopbar({ showLogout=false, onLogout }={}){
  const bar = document.createElement("div"); bar.className="topbar";

  // centro com logo + nome (arquivo VERDE)
  const center = document.createElement("div"); center.className="brand-center";
  const logo = document.createElement("img");
  logo.src = "./assets/logo/unikorverde-logo.png";
  logo.alt = "UNIKOR";
  logo.style.width = "72px"; logo.style.height="72px"; logo.style.objectFit="contain";
  const name = document.createElement("div"); name.className="brand-name"; name.textContent = "UNIKOR";
  center.append(logo, name);
  bar.appendChild(center);

  // botão sair pequeno no canto
  if (showLogout){
    const b = document.createElement("button");
    b.className = "btn-logout";
    b.textContent = "Sair";
    b.onclick = onLogout;
    bar.appendChild(b);
  }
  return bar;
}
