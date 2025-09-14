<script type="module">
// public/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

/* TODO: Trocar pelos dados do SEU projeto (frente pode conter essas chaves públicas). */
export const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  appId: "SUA_APP_ID"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
</script>
