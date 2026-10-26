// Exercise the real IPC, filesystem, renderer and decoder; replace only the
// external YouTube process with deterministic local audio for offline checks.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (process.versions.electron) {
  const { EventEmitter } = require('node:events');
  childProcess.spawn = (command, args) => {
    if (command !== 'yt-dlp') throw new Error(`Unexpected process: ${command}`);
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    const timer = setTimeout(() => {
      const output = args[args.indexOf('-o') + 1].replace('%(ext)s', 'mp3');
      fs.copyFileSync(path.join(root, 'assets/white.wav'), output);
      child.stdout.emit('data', Buffer.from(`PROGRESS:100%\nRESULT:${JSON.stringify({title:'Imported test audio',filepath:output})}\n`));
      child.emit('close', 0);
    }, 500);
    child.kill = () => { clearTimeout(timer); child.emit('close', 1); };
    return child;
  };
  require('../main.js');
} else {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whitenoisebar-libraries-'));
  const screenshots = path.join(root, 'work/tests'); fs.mkdirSync(screenshots, {recursive:true});
  fs.writeFileSync(path.join(temp, 'tracks.json'), JSON.stringify([{id:'legacy',title:'Legacy sound',path:path.join(root,'assets/pink.wav'),source:'YouTube'}]));
  try {
    for (const script of ['library-imports.js', 'library-restart.js']) {
      const result = childProcess.spawnSync(require('electron'), [__filename], {
        env: {...process.env, WNB_TEST_DATA:temp, WNB_TEST_SCRIPT:path.join(__dirname,script), WNB_SMOKE_TEST:path.join(screenshots,script+'.png')},
        encoding:'utf8', timeout:45000
      });
      process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
      if (result.error) throw result.error;
      if (result.status !== 0 || !result.stdout.includes('WNB_SMOKE')) { process.exitCode = 1; break; }
      const saved = JSON.parse(fs.readFileSync(path.join(temp, 'tracks.json'), 'utf8'));
      if (!saved.every(t => ['white-noise','music'].includes(t.library))) throw new Error('Library classification was not saved');
    }
  } finally { fs.rmSync(temp, {recursive:true,force:true}); }
}
