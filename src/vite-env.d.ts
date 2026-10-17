interface ImportMetaEnv {
  readonly VITE_WORKFLOW_V07_ENABLED?: string;
  readonly VITE_WORKFLOW_V07_ALLOW_PRODUCTION?: string;
  readonly VITE_FIREBASE_ENABLED?: string;
  readonly VITE_FIREBASE_USE_EMULATORS?: string;
  readonly VITE_FIREBASE_EMULATOR_AUTH_PORT?: string;
  readonly VITE_FIREBASE_EMULATOR_FIRESTORE_PORT?: string;
  readonly VITE_FIREBASE_EMULATOR_FUNCTIONS_PORT?: string;
  readonly VITE_FIREBASE_EMULATOR_STORAGE_PORT?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
