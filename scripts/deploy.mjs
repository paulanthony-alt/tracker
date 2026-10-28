/**
 * Build Life OS and publish it to your Firebase project (free Spark plan):
 * the web app goes to Firebase Hosting and firestore.rules to Firestore.
 *
 *   npm run deploy
 *
 * Reads VITE_FIREBASE_PROJECT_ID from .env, so you don't pick the project twice.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const env = {};
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const project = env.VITE_FIREBASE_PROJECT_ID;
const missing = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'].filter((k) => !env[k]);
if (missing.length) {
  console.error(`\n  Missing in .env: ${missing.join(', ')}\n  Copy the values from Firebase console → Project settings → Your apps → Web app.\n`);
  process.exit(1);
}
if (env.VITE_FIREBASE_USE_EMULATOR === 'true') {
  console.error('\n  .env has VITE_FIREBASE_USE_EMULATOR=true — remove it before deploying.\n');
  process.exit(1);
}

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('npm', ['run', 'build']);
run('npx', ['firebase', 'deploy', '--only', 'hosting,firestore:rules', '--project', project]);
console.log(`\n  Live at https://${project}.web.app — open it and choose “Set your password”.\n`);
