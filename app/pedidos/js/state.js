// Estado central dos itens e do usuário
export let itens = [{ produto: "", tipo: "KG", quantidade: 0, preco: 0, total: 0, obs: "" }];
export function setItens(next){ itens = next; }
export function pushItem(){ itens.push({ produto:"", tipo:"KG", quantidade:0, preco:0, total:0, obs:"" }); }
export function removeItem(i){
  itens.splice(i,1);
  if(!itens.length) itens.push({ produto:"", tipo:"KG", quantidade:0, preco:0, total:0, obs:"" });
}

export let usuario = null; // {nome, role}
export function setUsuario(u){ usuario = u; }