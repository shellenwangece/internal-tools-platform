import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const networkBan = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'navigator.sendBeacon', 'localStorage', 'sessionStorage', 'document.cookie', 'indexedDB'];

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-globals': ['error', ...networkBan.filter((n) => !n.includes('.')).map((name) => ({ name, message: 'ITP apps must use the platform SDK; direct network and storage APIs are blocked by the sandbox.' }))],
      'no-restricted-properties': ['error', { object: 'window', property: 'fetch', message: 'Use the platform SDK.' }, { object: 'navigator', property: 'sendBeacon', message: 'No network access in ITP apps.' }, { object: 'document', property: 'cookie', message: 'No cookies in ITP apps.' }],
      'no-restricted-imports': ['error', { patterns: ['axios', 'node-fetch', 'ky', 'superagent', 'got', 'socket.io*'] }],
    },
  },
  { files: ['src/platform/**'], rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' } },
);
