// portal/api/_firebase-admin.js
import admin from "firebase-admin";

function getServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON ausente no Vercel");
  return JSON.parse(json);
}

export function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const svc = getServiceAccount();
  return admin.initializeApp({
    credential: admin.credential.cert(svc),
  });
}

export function getDb() {
  return getAdminApp().firestore();
}