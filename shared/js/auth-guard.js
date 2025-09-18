<script type="module">
  import { auth } from '/portal/shared/js/firebase.js';
  import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

  // Redireciona para login se não houver usuário
  export function requireAuth(redirectTo='/login/') {
    return new Promise(resolve => {
      onAuthStateChanged(auth, user => {
        if (!user) {
          const back = encodeURIComponent(location.pathname + location.search);
          location.replace(`${redirectTo}?next=${back}`);
        } else {
          resolve(user);
        }
      });
    });
  }
</script>
