// portal/api/_firebase-admin.js
import admin from "firebase-admin";


if (!admin.apps.length) {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env; // Correção: nomes das variáveis de ambiente
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error("Faltam envs do Firebase Admin: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY");
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}


export const db = admin.firestore();


// Retorna ref de coleção sob o tenant
export function tenantCol(tenantId, col) {
  if (!tenantId) throw new Error("tenantId obrigatório");
  return db.collection("tenants").doc(tenantId).collection(col);
}


export default admin;
