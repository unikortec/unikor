<script type="module">
// public/js/ui.js
export const Theme = {
  brand:"#1e7f46", brand600:"#1a703e",
  line:"#cfe7da", ink:"#0f1b16", muted:"#475569"
};

export function injectBaseStyles(){
  const css = `
  :root{ --brand:${Theme.brand}; --brand-600:${Theme.brand600}; --line:${Theme.line};
         --ink:${Theme.ink}; --muted:${Theme.muted}; --bg:#fff; --tile:#fff; }
  *{box-sizing:border-box} html,body{height:100%}
  body{ margin:0; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
        color:var(--ink); background:#fff;}
  .container{ max-width:440px; margin:0 auto; padding:20px;}
  .screen{ display:none; min-height:100dvh; }
  .screen.active{ display:block; }
  .topbar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px;}
  .brand-row{ display:flex; align-items:center; gap:12px;}
  .brand-mark{ width:28px; height:28px; color:var(--brand); }
  .brand-name{ font-size:26px; font-weight:800; letter-spacing:.5px; color:var(--brand);}
  .welcome{ margin-left:auto; color:var(--muted); font-weight:600; }
  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .tile{ background:var(--tile); border:2px solid var(--brand); border-radius:18px; padding:18px;
         display:flex; flex-direction:column; align-items:center; gap:12px; cursor:pointer;
         transition:transform .05s ease-out, box-shadow .12s ease-out;}
  .tile:hover{ transform:translateY(-1px); box-shadow:0 6px 16px rgba(23,68,46,.10)}
  .tile svg{ width:34px; height:34px; stroke:var(--brand);}
  .tile-title{ font-weight:800; font-size:17px; color:var(--ink)}
  .fab{ position:fixed; right:18px; bottom:18px; width:56px; height:56px; border-radius:999px;
        background:var(--brand); display:none; align-items:center; justify-content:center;
        box-shadow:0 10px 22px rgba(23,68,46,.25); cursor:pointer; color:#fff;}
  .fab.visible{ display:flex; }
  button.link{ background:#eef6f1; border:1.5px solid var(--line); color:var(--brand);
               padding:8px 12px; border-radius:10px; font-weight:800; cursor:pointer;}
  .login-card{ background:#f7fbf8;border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 1px 0 rgba(0,0,0,.02)}
  .logo-text{ font-size:30px;font-weight:900;letter-spacing:.6px;color:var(--brand); }
  h1{ color:var(--brand); margin:10px 0 18px; font-size:32px }
  label{ font-weight:700;font-size:14px;display:block;margin:14px 0 6px }
  input{ width:100%;padding:12px 14px;border:1.5px solid var(--line);border-radius:12px;font-size:16px; }
  .btn{ width:100%;padding:12px 16px;border-radius:12px;border:0;cursor:pointer;font-weight:800;font-size:16px;background:var(--brand);color:#fff;margin-top:14px }
  .btn:hover{ background:var(--brand-600) }
  .muted{ color:var(--muted);font-size:13px;text-align:center;margin-top:10px }
  a.link{ color:var(--brand);text-decoration:none;font-weight:700 }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

export function renderTopbar({title="UNIKOR", logoSVG, showLogout=false, onLogout}={}){
  const bar = document.createElement("div"); bar.className="topbar";
  const left = document.createElement("div"); left.className="brand-row";
  const logo = document.createElement("div"); logo.className="brand-mark"; logo.innerHTML = logoSVG || "";
  const name = document.createElement("div"); name.className="brand-name"; name.textContent = title;
  left.appendChild(logo); left.appendChild(name);
  const right = document.createElement("div"); right.className="welcome"; right.id="bemVindo"; right.textContent="Bem-vindo(a)";
  const btn = document.createElement("button"); btn.className="link"; btn.id="btnSair"; btn.textContent="Sair"; btn.style.display = showLogout?"":"none";
  if (showLogout && onLogout) btn.onclick = onLogout;
  const holder = document.createElement("div"); holder.style.display="flex"; holder.style.gap="8px"; holder.appendChild(right); holder.appendChild(btn);
  bar.appendChild(left); bar.appendChild(holder);
  return bar;
}
</script>
