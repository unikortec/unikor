<script type="module">
// public/js/guard.js
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

export function requireAuth({ roles=null, onReady }){
  onAuthStateChanged(auth, async (user)=>{
    if (!user){ window.location.href = "index.html"; return; }
    const token = await user.getIdTokenResult(true);
    const role = token?.claims?.role || "geral";

    if (Array.isArray(roles) && roles.length && !roles.includes(role)){
      alert("Acesso negado para este perfil.");
      window.location.href = "index.html";
      return;
    }
    onReady?.({ user, role, token });
  });
}
</script>
