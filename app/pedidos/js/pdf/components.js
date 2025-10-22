// components.js
export function drawCenteredKeyValueBox(doc, x,y,w, label, value, opts={}){
  const { rowH=12, titleSize=7, valueSize=7 } = opts;
  doc.setDrawColor(0); doc.setLineWidth(0.2); doc.rect(x,y,w,rowH,"S");
  const baseY = y + rowH/2;
  doc.setFont("helvetica","bold"); doc.setFontSize(titleSize);
  doc.text(String(label||"").toUpperCase(), x+w/2, baseY-2.2, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(valueSize);
  doc.text(String(value||"").toUpperCase(), x+w/2, baseY+3.2, {align:"center"});
  return rowH;
}

export function drawKeyValueBox(doc, x,y,w, label, value, opts={}){
  const { rowH=10, titleSize=7, valueSize=7 } = opts;
  doc.setDrawColor(0); doc.setLineWidth(0.2); doc.rect(x,y,w,rowH,"S");
  const yBase = y + rowH/2 + .5;
  doc.setFont("helvetica","bold"); doc.setFontSize(titleSize);
  const ltxt = (String(label||"").toUpperCase() + ": "); const lW = doc.getTextWidth(ltxt);
  doc.text(ltxt, x+3, yBase);
  doc.setFont("helvetica","normal"); doc.setFontSize(valueSize);
  doc.text(String(value||"").toUpperCase(), x+3+lW, yBase);
  return rowH;
}
