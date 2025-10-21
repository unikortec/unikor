import { stopScan } from './scanner.js';

export function openModal(){
  document.getElementById('scanModal')?.classList.remove('hidden');
}
export function closeModal(){
  document.getElementById('scanModal')?.classList.add('hidden');
  stopScan();
}

// garante o handler do botão Fechar assim que o script carrega
document.addEventListener('click', (ev)=>{
  if (ev.target && ev.target.id === 'btnCloseScan') {
    ev.preventDefault();
    closeModal();
  }
});