import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, Plugin} from 'vite';

function firestorePatchPlugin(): Plugin {
  return {
    name: 'firestore-patch-plugin',
    transform(code: string, id: string) {
      if (!id.includes('firestore')) return null;
      let modified = false;
      let newCode = code;
      if (/fail\s*\(\s*(?:15467|0x3c6b)\s*,/i.test(newCode)) {
        newCode = newCode.replace(/fail\s*\(\s*(?:15467|0x3c6b)\s*,\s*\{[^}]*\}\s*\)/g, 'false');
        modified = true;
      }
      const defaultClauseRegex = /default:\s*(?:if\s*\([^)]*\)\s*\{[^}]*\}\s*)?return\s+(?:!1|false|fail\s*\(\s*(?:15467|0x3c6b)[^)]*\));?/g;
      if (defaultClauseRegex.test(newCode)) {
        newCode = newCode.replace(defaultClauseRegex, 'default: return false;');
        modified = true;
      }
      if (modified) {
        return { code: newCode, map: null };
      }
      return null;
    }
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/',
    plugins: [react(), tailwindcss(), firestorePatchPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      force: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    },
  };
});
