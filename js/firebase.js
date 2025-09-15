// portal/public/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyC12s4PvUWtNxOlShPc7zXlzq4XWqlVo2w",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.firebasestorage.app",
  messagingSenderId: "329806123621",
  appId: "1:329806123621:web:9aeff2f5947cd106cf2c8c",
  measurementId: "G-WLXV3YK3EN"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
</script>

