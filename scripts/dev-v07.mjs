// Starts Vite for Workflow v0.7 against the alternate-port Firebase emulators
// (`npm run emulators:alt`). Demo credentials only: nothing can reach production.
// Usage: npm run dev:v07 [-- --offline]  (--offline disables Firebase entirely)
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const offline = process.argv.includes('--offline');
const env = {...process.env, VITE_WORKFLOW_V07_ENABLED: 'true'};
if (offline) Object.assign(env, {VITE_FIREBASE_ENABLED: 'false', VITE_FIREBASE_USE_EMULATORS: 'false'});
else Object.assign(env, {
  VITE_FIREBASE_ENABLED: 'true', VITE_FIREBASE_USE_EMULATORS: 'true',
  VITE_FIREBASE_PROJECT_ID: 'demo-cmg-formwork', VITE_FIREBASE_API_KEY: 'demo-api-key', VITE_FIREBASE_APP_ID: 'demo-app-id',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-cmg-formwork.firebaseapp.com', VITE_FIREBASE_STORAGE_BUCKET: 'demo-cmg-formwork.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000', VITE_FIREBASE_MEASUREMENT_ID: '',
  VITE_FIREBASE_EMULATOR_AUTH_PORT: '9109', VITE_FIREBASE_EMULATOR_FIRESTORE_PORT: '8180',
  VITE_FIREBASE_EMULATOR_FUNCTIONS_PORT: '5101', VITE_FIREBASE_EMULATOR_STORAGE_PORT: '9299',
});
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const port = offline ? '6173' : '6174';
const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', port, '--strictPort'], {env, stdio: 'inherit'});
child.on('exit', code => process.exit(code ?? 0));
