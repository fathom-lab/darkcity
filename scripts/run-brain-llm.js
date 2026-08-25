// pm2 entry for the local brain model. Node wrapper because pm2 mangles
// argument passing to bare .exe entries on Windows.
'use strict';
const { spawn } = require('child_process');

const EXE = process.env.LLAMA_EXE || 'C:\\Users\\heyzo\\llama-glimmer\\llama-server.exe';
const MODEL = process.env.LLAMA_MODEL || 'C:\\Users\\heyzo\\models\\darkflobi-fast\\Qwen2.5-7B-Instruct-Q4_K_M.gguf';
const PORT = process.env.LLAMA_PORT || '8600';

const child = spawn(EXE, ['-m', MODEL, '--port', PORT, '--host', '127.0.0.1', '-c', '8192'],
  { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  console.error(`[brain-llm] llama-server exited code=${code} signal=${signal}`);
  process.exit(code === null ? 1 : code);
});
