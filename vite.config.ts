import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],test:{include:['tests/**/*.test.{ts,tsx}'],exclude:['tests/rules.test.ts'],maxWorkers:2},
  build:{rollupOptions:{output:{manualChunks(id){
    if(id.includes('node_modules/firebase')||id.includes('node_modules/@firebase'))return 'firebase';
    if(id.includes('node_modules/react')||id.includes('node_modules/scheduler'))return 'react';
    if(id.includes('node_modules/lucide-react'))return 'icons';
    if(id.includes('/src/reference/'))return 'reference-data';
    return undefined;
  }}}}});
