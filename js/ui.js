// js/ui.js
export const Theme = {
  brand:    "#1e7f46",
  brand600: "#1a703e",
  ink:      "#0f1b16",
  line:     "#cfe7da",
  muted:    "#475569",
  gradA:    "#17a24f", // topo login
  gradB:    "#0c7d3a"  // base login
};

export function injectBaseStyles(){
  const css = `
  :root{
    --brand:${Theme.brand}; --brand-600:${Theme.brand600};
    --ink:${Theme.ink}; --line:${Theme.line}; --muted:${Theme.muted};
  }

  *{ box-sizing:border-box }
  html,body{ height:100% }
  body{
    margin:0;
    font-family: Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
    color:var(--ink);
    background:#fff;
  }

  /* ===== Screens ===== */
  .screen{ min-height:100dvh; display:none }
  .screen.active{ display:block }

  /* LOGIN */
  .screen.login{
    background: linear-gradient(180deg, ${Theme.gradA} 0%, ${Theme.gradB} 100%);
    color:#fff;
    display:flex; align-items:center; justify-content:center;
    padding:24px;
  }
  .screen.login .container{
    width:100%; max-width:420px;
  }
  .logo-stack{ text-align:center; margin:8px 0 8px }
  .brand-img-lg{
    width:96px; height:96px; display:block; margin:0 auto 12px;
  }
  .logo-text{
    font-size:48px; line-height:1; font-weight:900; letter-spacing:1px;
    text-align:center;
    text-shadow:0 2px 0 rgba(0,0,0,.08);
  }

  .login-card{
    margin-top:18px;
    background:#ffffff;
    border-radius:24px;
    padding:22px;
    box-shadow: 0 10px 28px rgba(0,0,0,.10);
  }
  .login-card h1{
    margin:0 0 16px;
    font-size:36px; line-height:1.1; font-weight:900; color:var(--brand);
    text-align:left;
  }
  label{ font-weight:700; font-size:14px; color:#1a2e22; display:block; margin:14px 0 6px }
  input{
    width:100%;
    padding:14px 16px;
    border:1.5px solid #e4efe8;
    border-radius:14px;
    font-size:16px;
    outline:none;
  }
  input:focus{ border-color:var(--brand) }

  .btn{
    width:100%; margin-top:16px;
    padding:14px 18px;
    border-radius:14px; border:0; cursor:pointer;
    background:var(--brand); color:#fff; font-weight:800; font-size:18px;
    box-shadow:0 10px 22px rgba(23,68,46,.25);
  }
  .btn:hover{ background:var(--brand-600) }

  .muted{ color:#4c6b5b; font-size:13px; text-align:center; margin-top:10px }
  a.link{ color:var(--brand); text-decoration:none; font-weight:700 }

  /* DASHBOARD */
  .screen.dashboard{ background:#fff; padding:24px }
  .screen.dashboard .container{ max-width:560px; margin:0 auto }

  .topbar{
    display:flex; align-items:center; justify-content:center;
    margin-bottom:12px;
  }
  .brand-img{
    width:180px; height:auto; display:block; margin:24px auto 10px;
  }

  .grid{
    display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:6px;
  }
  .tile{
    background:#fff;
    border:2px solid var(--brand);
    border-radius:24px;
    padding:24px 18px;
    display:flex; flex-direction:column; align-items:center; gap:12px;
    cursor:pointer;
    transition: transform .06s ease-out, box-shadow .12s ease-out;
  }
  .tile:hover{
    transform: translateY(-2px);
    box-shadow:0 8px 18px rgba(23,68,46,.10);
  }
  .tile svg{ width:48px; height:48px; stroke:var(--brand) }
  .tile-title{
    font-weight:900; font-size:20px; color:var(--brand);
    letter-spacing:.2px;
  }

  /* FAB Config */
  .fab{
    position:fixed; right:18px; bottom:18px;
    width:64px; height:64px; border-radius:999px;
    background:var(--brand); color:#fff;
    display:none; align-items:center; justify-content:center;
    box-shadow:0 10px 22px rgba(23,68,46,.25);
    cursor:pointer;
  }
  .fab.visible{ display:flex }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Topbar com logo de imagem (para a tela interna)
 * @param {{logoImg?: string, showLogout?: boolean, onLogout?: ()=>void}} p
 */
export function renderTopbar({ logoImg, showLogout=false, onLogout } = {}){
  const bar = document.createElement("div"); bar.className = "topbar";
  const holder = document.createElement("div");

  const img = document.createElement("img");
  img.className = "brand-img";
  img.alt = "UNIKOR";
  if (logoImg) img.src = logoImg;

  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "Sair";
  btn.style.width = "120px";
  btn.style.display = showLogout ? "block" : "none";
  btn.style.margin = "8px auto 0";
  if (showLogout && onLogout) btn.onclick = onLogout;

  holder.appendChild(img);
  holder.appendChild(btn);
  bar.appendChild(holder);
  return bar;
}
