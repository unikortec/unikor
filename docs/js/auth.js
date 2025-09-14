<script type="module">
// public/js/auth.js
import { auth } from "./firebase.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

export const $ = (s)=>document.querySelector(s);

export function onUser(cb){ return onAuthStateChanged(auth, cb); }
export async function doLogin(email, pass){ return signInWithEmailAndPassword(auth, email, pass); }
export async function doReset(email){ return sendPasswordResetEmail(auth, email); }
export async function doLogout(){ return signOut(auth); }
</script>
