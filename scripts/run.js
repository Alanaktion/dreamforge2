// Starts DreamForge's processes with the settings from .env.
//
//   node scripts/run.js dev    Vite (http://localhost:5173) + FastAPI with reload (:8000)
//   node scripts/run.js web    Vite only; /api is proxied to API_URL (default :8000)
//   node scripts/run.js api    FastAPI only, reloading on Python changes
//   node scripts/run.js start  FastAPI serving the built SPA and the API (PORT, default 3000)
//
// Arguments after the mode are passed to Vite, e.g. `npm run dev -- --host 0.0.0.0`.
//
// The Python side runs through uv (https://docs.astral.sh/uv/) from backend/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const [mode = 'dev', ...viteArgs] = process.argv.slice(2); // extra args go to Vite
if (fs.existsSync('.env')) process.loadEnvFile('.env');

const API_PORT = process.env.API_PORT ?? '8000';
const uvicorn = (...args) => [
  'uv',
  ['run', '--project', 'backend', 'uvicorn', 'dreamforge_api.main:app', '--proxy-headers', ...args]
];

const commands = {
  web: [['npx', ['vite', 'dev', ...viteArgs]]],
  api: [uvicorn('--reload', '--reload-dir', 'backend/src', '--port', API_PORT)],
  start: [uvicorn('--host', process.env.HOST ?? '0.0.0.0', '--port', process.env.PORT ?? '3000')]
};
commands.dev = [...commands.api, ...commands.web];

if (!commands[mode]) {
  console.error(`Unknown mode "${mode}". Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

const children = commands[mode].map(([command, args]) =>
  spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, API_URL: process.env.API_URL ?? `http://127.0.0.1:${API_PORT}` },
    shell: process.platform === 'win32'
  })
);

let exiting = false;
function stop(code) {
  if (exiting) return;
  exiting = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));
