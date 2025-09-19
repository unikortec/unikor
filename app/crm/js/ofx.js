export function parseOFX(text){
  text = (text||'').replace('\r','').replace('\u0000','').trim();
  const i=text.indexOf('<OFX>'); if(i>=0) text=text.slice(i);
  const out=[]; const re=/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi; let m;
  while((m=re.exec(text))!==null){
    const b=m[1];
    const get=(tag)=>{const r=new RegExp(`<${tag}>([^\r\n<]+)`,'i'); const mm=r.exec(b); return mm?mm[1].trim():'';};
    const amtStr=(get('TRNAMT')||'0');
    let val=parseFloat(amtStr.replace(',','.'));
    if(isNaN(val)){ val=parseFloat(amtStr.replace('.','').replace(',','.')); }
    const type = val<0?'expense':'income';
    out.push({ date: normDate(get('DTPOSTED')), type, description: (get('NAME')||get('MEMO')||'Transação'), amount: Math.abs(val||0) });
  }
  return out;
}
function normDate(s){ const m=(s||'').match(/^(\d{4})(\d{2})(\d{2})/); return m?`${m[1]}-${m[2]}-${m[3]}`:''; }