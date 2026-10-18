// Starts the UI against firebase.emulators-browser.json's isolated ports.
// Demo credentials and emulator endpoints only; this process cannot reach Production.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const env = {
  ...process.env,
  VITE_WORKFLOW_V07_ENABLED: 'true',
  VITE_FIREBASE_ENABLED: 'true',
  VITE_FIREBASE_USE_EMULATORS: 'true',
  VITE_FIREBASE_PROJECT_ID: 'demo-cmg-formwork',
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_APP_ID: 'demo-app-id',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-cmg-formwork.firebaseapp.com',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-cmg-formwork.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_MEASUREMENT_ID: '',
  VITE_FIREBASE_EMULATOR_AUTH_PORT: '9110',
  VITE_FIREBASE_EMULATOR_FIRESTORE_PORT: '8182',
  VITE_FIREBASE_EMULATOR_FUNCTIONS_PORT: '5103',
  VITE_FIREBASE_EMULATOR_STORAGE_PORT: '9300',
};
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const port = process.env.BROWSER_VITE_PORT || '6175';
const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', port, '--strictPort'], {env, stdio: 'inherit'});
child.on('exit', code => process.exit(code ?? 0));
