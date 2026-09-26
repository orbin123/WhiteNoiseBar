const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'whitenoisebar-modes-'));
try {
  const result = spawnSync(require('electron'), [root], {
    env: { ...process.env, WNB_TEST_DATA: temp, WNB_TEST_SCRIPT: path.join(__dirname, 'playback-modes.js'), WNB_SMOKE_TEST: path.join(temp, 'preview.png') },
    encoding: 'utf8', timeout: 45000
  });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  if (result.status !== 0 || !result.stdout.includes('"realAudioCompletion":true')) process.exitCode = 1;
} finally { rmSync(temp, {recursive:true,force:true}); }
