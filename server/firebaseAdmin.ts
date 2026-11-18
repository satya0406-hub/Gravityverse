import { initializeApp, getApps, getApp, App } from "firebase-admin/app";
import { getAuth as getAdminAuth, Auth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore, Firestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

export interface FirebaseAdminConfig {
  projectId: string;
  databaseId: string;
}

export function getFirebaseConfig(): FirebaseAdminConfig {
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  let databaseId = process.env.FIRESTORE_DATABASE_ID;

  if (!projectId || !databaseId) {
    try {
      const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf8");
        const parsed = JSON.parse(raw);
        if (!projectId && parsed.projectId) {
          projectId = parsed.projectId;
        }
        if (!databaseId && parsed.firestoreDatabaseId) {
          databaseId = parsed.firestoreDatabaseId;
        }
      }
    } catch (err) {
      console.warn("[Firebase Admin Config] Could not read firebase-applet-config.json:", err);
    }
  }

  return {
    projectId: projectId || "gen-lang-client-0125129054",
    databaseId: databaseId || "ai-studio-9a27347e-8207-4b10-91ab-ccbf4335a00a"
  };
}

export function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }
  const config = getFirebaseConfig();
  try {
    const app = initializeApp({ projectId: config.projectId });
    console.log(`[Firebase Admin] App initialized with projectId: ${config.projectId}`);
    return app;
  } catch (err) {
    console.warn("[Firebase Admin] App initialization warning:", err);
    return getApps().length > 0 ? getApp() : initializeApp();
  }
}

export function getDb(): Firestore | null {
  try {
    const app = getAdminApp();
    const config = getFirebaseConfig();
    return getAdminFirestore(app, config.databaseId);
  } catch (err) {
    console.warn("[Firebase Admin] getDb error:", err);
    return null;
  }
}

export function getAuthService(): Auth {
  const app = getAdminApp();
  return getAdminAuth(app);
}

export { FieldValue };
