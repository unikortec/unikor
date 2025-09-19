import { db, auth, tenantId, metaCreate, metaUpdate } from '../firebase.js';
import { collection, query, orderBy, getDocs, addDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { $, brl } from '../utils.js';

const ROOT = document.getElementById('view-clientes');

function tplList(items){
  const rows = items.map(c=>`
    <tr>
      <td>${c.name||''}</td>
      <td>${(c.phones||[]).join('<br>')}</td>
      <td>${c.doc||''}</td>
      <td>${(c.tags||[]).join(', ')}</td>
      <td class="right">
        <button class="btn" data-edit="${c.id}">Editar</button>
        <button class="btn" data-vendas="${c.id}">Vendas</button>
      </td>
    </tr>
  `).join('');
  return `
    <div class="card">
      <div class="row">
        <div class="field"><label>Busca</label><input id="cli-q" placeholder="nome/telefone/cpf"></div>
        <button id="cli-new" class="btn primary">Novo cliente</button>
      </div>
    </div>
    <div class="table-wrap card">
      <table><thead><tr><th>Nome</th><th>Telefone</th><th>Doc</th><th>Tags</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    <div id="cli-modal" class="card hidden"></div>
    <div id="cli-vendas" class="card hidden"></div>
  `;
}

function tplForm(c){
  const addr = (c.addresses||[])[0]||{};
  return `
  <h3>${c.id?'Editar':'Novo'} cliente</h3>
  <div class="row">
    <div class="field"><label>Nome</label><input id="f-name" value="${c.name||''}"></div>
    <div class="field"><label>Telefone</label><input id="f-phone" value="${(c.