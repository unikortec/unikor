// portal/apps/despesas/js/store.js
const NS = "unikor_despesas";
const key = (k)=> `${NS}:${k}`;

export const store = {
  getUser(){ return JSON.parse(localStorage.getItem(key('user'))||'null'); },
  setUser(u){ localStorage.setItem(key('user'), JSON.stringify(u)); },
  getNotas(){ return JSON.parse(localStorage.getItem(key('notas'))||'[]'); },
  setNotas(list){ localStorage.setItem(key('notas'), JSON.stringify(list)); },
  getCategorias(){
    const v = JSON.parse(localStorage.getItem(key('cats'))||'null');
    return v || ["Alimentação","Manutenção","Combustível","Limpeza","Embalagens"];
  },
  setCategorias(list){ localStorage.setItem(key('cats'), JSON.stringify(list)); },
};