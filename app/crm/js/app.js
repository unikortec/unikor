import { attachAuthGuard, doSignOut } from './firebase.js';
import { setTabs, onOnlineStatus } from './utils.js';
import * as Clients from './modules/clients.js';
import * as MapMod from './modules/map.js';
import * as Expenses from './modules/expenses.js';
import * as Entries from './modules/entries.js';
import * as Finance from './modules/finance.js';
import * as Total from './modules/total.js';

setTabs();
onOnlineStatus();
document.getElementById('btnSignOut').onclick = doSignOut;

function mountAll(){
  Clients.mount();
  MapMod.mount();
  Expenses.mount();
  Entries.mount();
  Finance.mount();
  Total.mount();
}

attachAuthGuard((user)=>{ mountAll(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', ()=> navigator.serviceWorker.register('./service-worker.js'));
}