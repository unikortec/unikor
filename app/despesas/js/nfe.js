// portal/apps/despesas/js/nfe.js
const parseXML = (str)=> new DOMParser().parseFromString(str, 'text/xml');
const txt = (el, sel)=>{ const n = el.querySelector(sel); return n? (n.textContent||'').trim():'' };
const numBR = (v)=> parseFloat((v||'0').replace(',', '.'))||0;

export function parseNFe55XML(xmlStr){
  const x = parseXML(xmlStr);
  const ide = x.querySelector('ide');
  const emit = x.querySelector('emit');
  const total = numBR(txt(x,'ICMSTot>vNF'));
  const dhEmi = txt(ide,'dhEmi') || txt(ide,'dEmi');
  const data = dhEmi? new Date(dhEmi).toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
  const empresa = (txt(emit,'xNome') || txt(emit,'xFant')).toUpperCase();
  const cnpj = txt(emit,'CNPJ');
  const itens = [...x.querySelectorAll('det')].map(d=>{
    const p=d.querySelector('prod');
    const nome=txt(p,'xProd');
    const qtd=numBR(txt(p,'qCom')||txt(p,'qTrib'));
    const unit=numBR(txt(p,'vUnCom')||txt(p,'vUnTrib'));
    const subtotal=qtd*unit;
    return {nome,qtd,unit,subtotal};
  });
  return {empresa, cnpj, data, itens, total, origem:'nfe55'};
}

export function parseNFCeXML(xmlStr){
  const x = parseXML(xmlStr);
  const ide = x.querySelector('ide');
  const emit = x.querySelector('emit');
  const dets = [...x.querySelectorAll('det')];
  const total = numBR(txt(x,'ICMSTot>vNF')) || dets.reduce((s,d)=>{
    const p=d.querySelector('prod');
    return s + numBR(txt(p,'vProd')) - numBR(txt(p,'vDesc'));
  },0);
  const dEmi = txt(ide,'dhEmi') || txt(ide,'dEmi');
  const data = dEmi? new Date(dEmi).toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
  const empresa = (txt(emit,'xNome') || txt(emit,'xFant')).toUpperCase();
  const cnpj = txt(emit,'CNPJ');
  const itens = dets.map(d=>{
    const p=d.querySelector('prod');
    const nome=txt(p,'xProd');
    const qtd=numBR(txt(p,'qCom')||txt(p,'qTrib'));
    const unit=numBR(txt(p,'vUnCom')||txt(p,'vUnTrib'));
    const subtotal=qtd*unit;
    return {nome,qtd,unit,subtotal};
  });
  return {empresa, cnpj, data, itens, total, origem:'nfce'};
}