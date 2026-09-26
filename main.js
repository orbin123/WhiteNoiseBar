const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
let win, tray, tracks = [], activeDownload, dataDir, contextMenuOpen = false;
let libraryQueue = Promise.resolve();
function mutateLibrary(action) { const next = libraryQueue.then(action); libraryQueue = next.catch(() => {}); return next; }
if (process.env.WNB_TEST_DATA) app.setPath("userData", process.env.WNB_TEST_DATA);
const env = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}` };
protocol.registerSchemesAsPrivileged([{ scheme: 'noise', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => show());
async function saveTracks() {
  const file = path.join(dataDir, 'tracks.json');
  await fs.writeFile(file + '.tmp', JSON.stringify(tracks, null, 2));
  await fs.rename(file + '.tmp', file);
}
function publicTracks() { return tracks.map(t => ({ ...t, url: `noise://audio/${t.id}` })); }
function position() {
  const b = tray.getBounds(), area = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  const [w, h] = win.getSize();
  win.setPosition(Math.round(Math.max(area.x, Math.min(b.x + b.width / 2 - w / 2, area.x + area.width - w))), Math.round(Math.min(b.y + b.height + 6, area.y + area.height - h)));
}
function show() { if (!win || !tray) return; position(); win.show(); win.focus(); }
function runDownload(url) {
  if (activeDownload) throw new Error('A download is already in progress.');
  let u; try { u = new URL(url); } catch { throw new Error('Paste a valid YouTube link.'); }
  if (u.protocol !== 'https:' || !['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(u.hostname) || u.username || u.password) throw new Error('Please use an https YouTube video link.');
  const id = randomUUID();
  const args = ['--ignore-config','--no-playlist','--no-warnings','--newline','--no-colors','--progress','--progress-template','download:PROGRESS:%(progress._percent_str)s','--socket-timeout','30','--retries','3','--max-filesize','500M','--js-runtimes','node:/opt/homebrew/bin/node','-x','--audio-format','mp3','--audio-quality','192K','--ffmpeg-location','/opt/homebrew/bin','--print','after_move:RESULT:%(.{title,filepath,id})j','-o',path.join(dataDir,'audio',id + '.%(ext)s'),'--',u.href];
  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', args, { env }); activeDownload = child;
    let buffer = '', errors = '', result, settled = false;
    const timeout = setTimeout(() => { child.kill('SIGTERM'); finish(new Error('Download timed out. Try a shorter video.')); }, 30 * 60 * 1000);
    function finish(error, value) { if (settled) return; settled = true; clearTimeout(timeout); activeDownload = null; error ? reject(error) : resolve(value); }
    child.stdout.on('data', chunk => {
      buffer += chunk.toString(); const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('PROGRESS:') && !win.isDestroyed()) win.webContents.send('download-progress', line.slice(9).trim());
        if (line.startsWith('RESULT:')) { try { result = JSON.parse(line.slice(7)); } catch {} }
      }
    });
    child.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-4000); });
    child.on('error', error => finish(new Error(error.code === 'ENOENT' ? 'yt-dlp is missing. Install it with brew install yt-dlp.' : error.message)));
    child.on('close', async code => {
      if (settled) return;
      if (code !== 0 || !result) return finish(new Error(errors.trim().slice(-700) || 'Audio could not be downloaded. Try another video.'));
      try {
        const audioPath = path.resolve(result.filepath);
        if (path.dirname(audioPath) !== path.join(dataDir,'audio')) throw new Error('Unexpected audio location.');
        await fs.access(audioPath);
        const track = { id, title: result.title || 'YouTube audio', path: audioPath, source: 'YouTube' };
        await mutateLibrary(async () => { tracks.push(track);
        try { await saveTracks(); } catch (e) { tracks = tracks.filter(t => t.id !== track.id); throw e; } });
        finish(null, { ...track, url: `noise://audio/${id}` });
      } catch(e) { finish(e); }
    });
  });
}
app.whenReady().then(async () => {
  app.dock?.hide(); dataDir = app.getPath('userData');
  await fs.mkdir(path.join(dataDir, 'audio'), { recursive: true });
  let libraryLoaded = false;
  try {
    const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'tracks.json'), 'utf8'));
    if (!Array.isArray(saved)) throw new Error('Invalid library');
    libraryLoaded = true;
    tracks = saved.filter(t => typeof t.id === 'string' && typeof t.title === 'string' && typeof t.path === 'string');
  } catch (error) {
    if (error.code !== 'ENOENT') await fs.copyFile(path.join(dataDir,'tracks.json'), path.join(dataDir,`tracks-backup-${Date.now()}.json`)).catch(() => {});
  }
  for (const [id, title] of [['white','White noise'],['pink','Pink noise'],['brown','Brown noise']]) {
    const existing = tracks.find(t => t.id === id);
    const asset = path.join(__dirname,'assets',`${id}.wav`);
    if (existing) existing.path = asset; else if (!libraryLoaded) tracks.push({ id, title, path: asset, source: 'Built-in · seamless loop' });
  }
  await saveTracks();
  protocol.handle('noise', async request => {
    const u = new URL(request.url), track = tracks.find(t => t.id === u.pathname.slice(1));
    if (u.hostname !== 'audio' || !track) return new Response('Not found', { status: 404 });
    try {
      const { size } = await fs.stat(track.path);
      const types = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' };
      const headers = { 'Content-Type': types[path.extname(track.path)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      let start = 0, end = size - 1, status = 200;
      const range = request.headers.get('range');
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) return new Response(null, {status:416,headers:{'Content-Range':`bytes */${size}`}});
        if (!match[1]) start = Math.max(0, size - Number(match[2]));
        else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
        if (start > end || start >= size) return new Response(null, {status:416,headers:{'Content-Range':`bytes */${size}`}});
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      }
      headers['Content-Length'] = String(end - start + 1);
      if (request.method === 'HEAD') return new Response(null, { status, headers });
      const stream = require('node:fs').createReadStream(track.path, {start, end});
      return new Response(require('node:stream').Readable.toWeb(stream), {status, headers});
    } catch { return new Response('Audio unavailable', {status:404}); }
  });
  win = new BrowserWindow({ width: 320, height: 410, show: false, frame: false, transparent: true, resizable: false, fullscreenable: false, maximizable: false, minimizable: false, skipTaskbar: true, hasShadow: true, vibrancy: 'popover', visualEffectState: 'active', roundedCorners: true, backgroundColor: '#00000000', webPreferences: { preload: path.join(__dirname,'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.on('blur', () => { if (!contextMenuOpen) win.hide(); });
  win.on('close', e => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  const icon = nativeImage.createFromPath(path.join(__dirname,'assets','trayTemplate.png')); icon.setTemplateImage(true);
  tray = new Tray(icon); tray.setToolTip('WhiteNoiseBar');
  tray.on('click', () => win.isVisible() ? win.hide() : show());
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([{label:'Show WhiteNoiseBar',click:show},{type:'separator'},{label:'Quit WhiteNoiseBar',click:()=>app.quit()}])));
  function trusted(event) { if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Invalid sender'); }
  ipcMain.handle('get-tracks', event => { trusted(event); return publicTracks(); });
  ipcMain.handle('track-menu', (event, id) => {
    trusted(event);
    if (!tracks.some(t => t.id === id)) return false;
    return new Promise(resolve => {
      let selected = null; contextMenuOpen = true;
      Menu.buildFromTemplate([{ label: 'Rename sound', click: () => { selected = 'rename'; } }, { label: 'Delete sound', click: () => { selected = 'delete'; } }]).popup({ window: win, callback: () => {
        contextMenuOpen = false;
        if (selected === 'rename') { win.show(); win.focus(); }
        else if (!win.isFocused()) win.hide();
        resolve(selected);
      } });
    });
  });
  ipcMain.handle('rename-track', (event, id, title) => {
    trusted(event);
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) throw new Error('Use a name between 1 and 120 characters.');
    return mutateLibrary(async () => {
      const track = tracks.find(t => t.id === id);
      if (!track) throw new Error('Sound no longer exists.');
      const previous = track.title; track.title = title.trim();
      try { await saveTracks(); } catch (e) { track.title = previous; throw e; }
      return { ...track, url: `noise://audio/${track.id}` };
    });
  });
  ipcMain.handle('delete-track', (event, id) => {
    trusted(event);
    return mutateLibrary(async () => {
      const track = tracks.find(t => t.id === id);
      if (!track) return publicTracks();
      const previous = tracks; tracks = tracks.filter(t => t.id !== id);
      try { await saveTracks(); } catch (e) { tracks = previous; throw e; }
      // Only imported audio owned by this app may be moved to Trash.
      if (path.dirname(path.resolve(track.path)) === path.join(dataDir, 'audio')) {
        try { await fs.access(track.path); await shell.trashItem(track.path); }
        catch (e) { if (e.code !== 'ENOENT') { tracks = previous; await saveTracks(); throw e; } }
      }
      return publicTracks();
    });
  });
  ipcMain.handle('download-youtube', async (event, url) => { trusted(event); if (typeof url !== 'string' || url.length > 2048) throw new Error('Invalid link'); return runDownload(url); });
  ipcMain.handle('resize-window', (event, expanded) => { trusted(event); win.setSize(320, expanded ? 540 : 410); position(); });
  await win.loadFile('index.html');
  if (process.env.WNB_SMOKE_TEST) {
    await new Promise(r => setTimeout(r, 1000));
    const result = await win.webContents.executeJavaScript(process.env.WNB_TEST_SCRIPT ? await fs.readFile(process.env.WNB_TEST_SCRIPT, "utf8") : `(async () => { const t = await window.whiteNoise.getTracks(); const a = new Audio(t[0].url); a.muted = true; await a.play(); a.pause(); document.querySelector('#expand').click(); return {tracks:t.length,audioReady:a.readyState,expanded:document.querySelector('#expand').getAttribute('aria-expanded'),cards:document.querySelectorAll('.track').length}; })()`);
    console.log('WNB_SMOKE', JSON.stringify(result)); await win.capturePage().then(img => fs.writeFile(process.env.WNB_SMOKE_TEST,img.toPNG())); app.quit();
  } else show();
}).catch(error => { console.error(error); app.exit(1); });
app.on('before-quit', () => { app.isQuitting = true; activeDownload?.kill('SIGTERM'); });
app.on('window-all-closed', () => {});
