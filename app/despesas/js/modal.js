export function openModal(){
  document.getElementById('scanModal')?.classList.remove('hidden');
}
export function closeModal(){
  document.getElementById('scanModal')?.classList.add('hidden');
}