// js/ui.js
export const Theme = {
  brand: "#1e7f46",
  brand600: "#1a703e",
  ink: "#0f1b16",
  line: "#cfe7da",
  muted: "#475569",
  surface: "#ffffff"
};

export function injectBaseStyles(){
  const css = `
  :root{
    --brand:${Theme.brand};
    --brand-600:${Theme.brand600};
    --ink:${Theme.ink};
    --line:${Theme.line};
    --muted:${Theme.muted};
    --surface:${Theme.surface};
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0; color:var(--ink); background:var(--surface);
       font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}

  /* SCREENS */
  .screen{display:none; min-height:100dvh}
  .screen.active{display:block}
  .screen--login{
    /* degrade verde como no mock */
    background: linear-gradient(135deg, #2aa155 0%, #197c43 60%, #116b39 100%);
    display:flex; align-items:center; justify-content:center; padding:24px;
  }

  /* CONTAINERS */
  .container{width:100%; margin:0 auto}
  .container--narrow{max-width:520px; background:#fff; border-radius:24px; padding:28px 22px;
                     box-shadow:0 22px 60px rgba(0,0,0,.14)}
  .container--wide{max-width:1200px; padding:16px}

  /* LOGIN UI */
  .login-logo{display:flex; justify-content:center; margin:4px 0 16px}
  .login-logo img{width:170px; height:auto}
  .login-title{margin:6px 0 18px; text-align:center; font-size:40px; line-height:1; color:#1c7b45}
  label{display:block; font-weight:800; font-size:16px; margin:10px 6px}
  input{
    width:100%; border:0; outline:0; background:#eaf2ff;
    font-size:18px; padding:16px 18px; border-radius:14px;
  }
  .btn{width:100%; border:0; border-radius:18px; padding:16px; font-weight:900; font-size:22px; cursor:pointer}
  .btn--primary{background:var(--brand); color:#fff; margin-top:16px;
                box-shadow:0 22px 38px rgba(10,60,30,.24)}
  .btn--primary:hover{background:var(--brand-600)}
  .muted{margin-top:12px; text-align:center; color:var(--brand); font-weight:700}

  /* DASHBOARD HEADER */
  .header{padding:8px 0 18px}
  .brand-center{display:flex; justify-content:center; align-items:center; margin:8px 0 4px}
  .brand-center img{width:280px; height:auto; max-width:70vw}

  /* Logout pequeno no topo direito (fora do container para posicionamento global) */
  .logout{
    position:fixed; right:16px; top:12px;
    display:inline-flex; align-items:center; justify-content:center;
    padding:6px 14px; border-radius:999px; border:2px solid var(--line);
    background:var(--brand); color:#fff; font-weight:800; box-shadow:0 8px 18px rgba(7,60,30,.18);
  }

  /* GRID E TILES */
  .grid{
    display:grid; grid-template-columns:repeat(2, 1fr); gap:26px; padding:6px;
  }
  @media (max-width:880px){ .grid{grid-template-columns:1fr} }
  .tile{
    background:#fff; border:3px solid var(--brand); border-radius:28px;
    min-height:170px; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:14px; cursor:pointer; transition:transform .06s ease, box-shadow .12s ease;
  }
  .tile:hover{ transform:translateY(-2px); box-shadow:0 10px 26px rgba(17,107,57,.18) }
  .tile-icon svg{ width:58px; height:58px; stroke:var(--brand) }
  .tile-title{ font-weight:900; font-size:30px; color:var(--brand) }

  /* FAB Config redondo */
  .fab{
    position:fixed; right:18px; bottom:18px; width:72px; height:72px;
    border-radius:999px; display:flex; align-items:center; justify-content:center;
    background:var(--brand); color:#fff; box-shadow:0 22px 44px rgba(10,60,30,.25);
  }
  .fab svg{ width:34px; height:34px; stroke:#fff; fill:none; stroke-width:2 }
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}

/** Header com logo central (dashboard) */
export function renderHeader({ logoSrc }){
  const wrap = document.createElement('div'); wrap.className = 'header';
  const center = document.createElement('div'); center.className = 'brand-center';
  const img = document.createElement('img'); img.src = logoSrc; img.alt = 'UNIKOR';
  center.appendChild(img); wrap.appendChild(center);
  return wrap;
}
