// scripts/provision_users.js
import admin from "firebase-admin";
import fs from "node:fs";

const SA_PATH = process.env.FB_SA_JSON || "./serviceAccount.json";
if (!fs.existsSync(SA_PATH)) {
  console.error("⚠ serviceAccount.json não encontrado. Defina a env FB_SA_JSON, ex.: C:\\keys\\unikor\\serviceAccount.json");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(fs.readFileSync(SA_PATH, "utf-8")))
});

const auth = admin.auth();

const USERS = [
  { email:"leo@unikor.com.br",        password:"Trocar@123", displayName:"Leo",         role:"master" },
  { email:"jayson@unikor.com.br",     password:"Trocar@123", displayName:"Jayson",      role:"geral"  },
  { email:"karen@unikor.com.br",      password:"Trocar@123", displayName:"Karen",       role:"geral"  },
  { email:"serranobre@unikor.com.br", password:"Trocar@123", displayName:"Serra Nobre", role:"geral"  },
  { email:"monica@unikor.com.br",     password:"Trocar@123", displayName:"Monica",      role:"geral"  }
];

async function ensureUser({email,password,displayName,role}){
  let user;
  try {
    user = await auth.getUserByEmail(email);
    console.log(`✔ Já existe: ${email} (${user.uid})`);
    if (displayName && user.displayName !== displayName){
      await auth.updateUser(user.uid, { displayName });
      console.log(`  • displayName atualizado`);
    }
  } catch {
    user = await auth.createUser({ email, password, displayName, emailVerified: true, disabled: false });
    console.log(`＋ Criado: ${email} (${user.uid})`);
  }
  await auth.setCustomUserClaims(user.uid, { role });
  console.log(`  • Claims definidas: role=${role}`);
}

(async ()=>{
  for (const u of USERS) { await ensureUser(u); }
  console.log("\n✅ Provisionamento concluído.");
  process.exit(0);
})();
