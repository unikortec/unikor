// js/legacy-adapter.js
// Conecta atributos inline antigos aos handlers novos, sem quebrar nada.
(function(){
  const map = {
    gerarPDF: (e)=> window.gerarPDF && window.gerarPDF(false, e?.target),
    salvarPDF: (e)=> window.gerarPDF && window.gerarPDF(true, e?.target),
    adicionarItem: ()=> window.adicionarItem && window.adicionarItem(),
    atualizarFreteUI: ()=> window.atualizarFreteUI && window.atualizarFreteUI(),
  };
  document.addEventListener('DOMContentLoaded', ()=>{
    document.querySelectorAll('[onclick]').forEach(el=>{
      const fn = (el.getAttribute('onclick')||'').replace(/\(.*\)\s*;?\s*$/,'').trim();
      if (map[fn]) {
        el.removeAttribute('onclick');
        el.addEventListener('click', (e)=>map[fn](e));
      }
    });
  });
})();