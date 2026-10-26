const $ = id => document.getElementById(id);
const audio = new Audio(); audio.preload = 'auto';
const playbackModes = ['shuffle', 'loop-one', 'in-order'];
const modeNames = { shuffle: 'Shuffle', 'loop-one': 'Loop One', 'in-order': 'In Order' };
const modeIcons = {
  shuffle: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  'loop-one': '<path d="m17 3 3 3-3 3M20 6H6a3 3 0 0 0-3 3v2m4 10-3-3 3-3M4 18h14a3 3 0 0 0 3-3v-2"/><path d="m10 10 2-1v6"/>',
  'in-order': '<path d="M3 7h17m-4-4 4 4-4 4M3 17h17m-4-4 4 4-4 4"/>'
};
const libraries = ['white-noise', 'music'];
const libraryNames = { 'white-noise': 'White noise', music: 'Music' };
const libraryIcons = {
  'white-noise': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 7c3-4 7 4 10 0s7 4 10 0M2 12c3-4 7 4 10 0s7 4 10 0M2 17c3-4 7 4 10 0s7 4 10 0"/></svg>',
  music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13M9 8l12-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
};
let library = libraries.includes(localStorage.getItem('active-library')) ? localStorage.getItem('active-library') : 'white-noise';
let tracks = [], currentId, playbackMode, expanded = false, history = [], saved = {}, switching = false, pendingSeek;
let downloadingLibrary = null;
const drafts = {}, importStatuses = {};
function readPlayback(key) {
  try {
    const value = JSON.parse(localStorage.getItem(`playback:${key}`) || (key === 'white-noise' ? localStorage.getItem('playback') : null) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}
function loadPlayback() {
  saved = readPlayback(library);
  playbackMode = playbackModes.includes(saved.mode) ? saved.mode : saved.shuffle ? 'shuffle' : library === 'music' ? 'in-order' : 'loop-one';
  audio.loop = playbackMode === 'loop-one'; currentId = undefined; history = [];
}
loadPlayback();
const legacyVolume = readPlayback('white-noise').volume;
const storedVolume = Number(localStorage.getItem('app-volume') ?? (Number.isFinite(legacyVolume) ? legacyVolume : 1));
audio.volume = Number.isFinite(storedVolume) ? Math.max(0, Math.min(1, storedVolume)) : 1;
function persist() {
  localStorage.setItem(`playback:${library}`, JSON.stringify({ id: currentId, mode: playbackMode, time: pendingSeek && pendingSeek.id === currentId ? pendingSeek.time : audio.currentTime, playing: !audio.paused }));
  localStorage.setItem('app-volume', String(audio.volume));
}
function closeLibraries(focus = false) {
  $('library-menu').hidden = true; $('library-button').setAttribute('aria-expanded', 'false');
  if (focus) $('library-button').focus();
}
$('library-button').onclick = () => {
  const open = $('library-menu').hidden;
  closeVolume(); $('library-menu').hidden = !open; $('library-button').setAttribute('aria-expanded', String(open));
  if (open) $(`choose-${library}`).focus();
};
$('library-menu').onkeydown = event => {
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const buttons = [...$('library-menu').querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length].focus();
  }
};
for (const key of libraries) $(`choose-${key}`).onclick = () => { closeLibraries(true); void switchLibrary(key); };
document.addEventListener('pointerdown', event => { if (!event.target.closest('.library-control')) closeLibraries(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('library-menu').hidden) { closeLibraries(true); event.preventDefault(); } });
window.addEventListener('blur', () => closeLibraries());
function updateImportForm() {
  $('url').value = drafts[library] || '';
  $('submit').disabled = downloadingLibrary !== null;
  $('url').disabled = downloadingLibrary === library;
  const status = importStatuses[library];
  $('status').className = status?.error ? 'error' : '';
  $('status').textContent = status?.text || (downloadingLibrary ? `Adding audio to ${libraryNames[downloadingLibrary]}…` : 'Paste a YouTube link to save its audio.');
}
function updateLibrary() {
  const music = library === 'music';
  $('library-title').textContent = libraryNames[library];
  $('library-button').setAttribute('aria-label', `Choose library: ${libraryNames[library]}`);
  $('library-button').querySelector('.brand-mark').innerHTML = libraryIcons[library];
  $('library-label').textContent = music ? 'YOUR MUSIC' : 'YOUR SOUNDS';
  $('tracks').setAttribute('aria-label', music ? 'Music library' : 'White noise library');
  $('add-heading').textContent = music ? 'Add music from YouTube' : 'A little more atmosphere';
  for (const key of libraries) $(`choose-${key}`).setAttribute('aria-checked', String(key === library));
  updateImportForm();
}
function restoreTrack(resume = false) {
  select(tracks.some(t => t.id === saved.id) ? saved.id : tracks[0]?.id, false, false, saved.time);
  $('playback-status').textContent = tracks.length ? (library === 'music' ? 'Your music, your space.' : 'A quieter space to focus.') : (library === 'music' ? 'Add your first song from YouTube.' : 'No sounds yet. Add a YouTube link.');
  if (resume && saved.playing && currentId) void play();
}
async function switchLibrary(nextLibrary) {
  if (switching || nextLibrary === library || !libraries.includes(nextLibrary)) return;
  switching = true;
  try {
    const nextTracks = await window.whiteNoise.getTracks(nextLibrary);
    drafts[library] = $('url').value;
    audio.pause(); persist();
    pendingSeek = undefined; audio.onloadedmetadata = null; audio.removeAttribute('src'); audio.load();
    library = nextLibrary; tracks = nextTracks; loadPlayback();
    localStorage.setItem('active-library', library);
    if (expanded) await setExpanded(false);
    updateLibrary(); render(); restoreTrack(); $('tracks').scrollTop = 0;
  } catch { $('playback-status').textContent = 'Could not open that library. Please try again.'; }
  finally { switching = false; }
}
function updateVolume() {
  const percent = Math.round(audio.volume * 100);
  $('volume').value = percent; $('volume-value').textContent = `${percent}%`;
  $('volume').setAttribute('aria-valuetext', `${percent} percent`);
  const waves = percent === 0 ? '<path d="m16 9 5 6m0-6-5 6"/>' : percent < 50 ? '<path d="M16 9a5 5 0 0 1 0 6"/>' : '<path d="M16 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/>';
  $('volume-button').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 6 8H2v8h4l5 4Z"/>${waves}</svg>`;
  $('volume-button').setAttribute('aria-label', `App volume: ${percent}%. Adjust volume`);
  $('volume-button').title = `App volume · ${percent}%`;
}
function closeVolume() { $('volume-panel').hidden = true; $('volume-button').setAttribute('aria-expanded','false'); }
$('volume-button').onclick = () => {
  const open = $('volume-panel').hidden;
  closeLibraries();
  $('volume-panel').hidden = !open; $('volume-button').setAttribute('aria-expanded', String(open));
  if (open) $('volume').focus();
};
$('volume').oninput = () => { audio.volume = Number($('volume').value) / 100; updateVolume(); persist(); };
audio.addEventListener('volumechange', updateVolume);
document.addEventListener('pointerdown', event => { if (!event.target.closest('.volume-control')) closeVolume(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('volume-panel').hidden) { closeVolume(); $('volume-button').focus(); event.preventDefault(); } });
window.addEventListener('blur', closeVolume);
updateVolume();
function controls() {
  $('play').textContent = audio.paused ? '▶' : '⏸'; $('play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  $('play').disabled = !tracks.length;
  $('previous').disabled = $('next').disabled = !tracks.length;
  const modeButton = $('playback-mode');
  const nextMode = playbackModes[(playbackModes.indexOf(playbackMode) + 1) % playbackModes.length];
  modeButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${modeIcons[playbackMode]}</svg>`;
  modeButton.dataset.mode = playbackMode;
  modeButton.setAttribute('aria-label', `Playback mode: ${modeNames[playbackMode]}. Switch to ${modeNames[nextMode]}`);
  modeButton.title = `${modeNames[playbackMode]} · Click for ${modeNames[nextMode]}`;
  for (const tile of $('tracks').querySelectorAll('.track')) {
    const selected = tile.dataset.id === currentId;
    tile.classList.toggle('selected', selected);
    tile.querySelector('.track-button').setAttribute('aria-pressed', String(selected));
    tile.querySelector('.track-indicator').textContent = selected ? (audio.paused ? '▶' : 'Ⅱ') : '';
    tile.querySelector('.timeline').hidden = !selected;
  }
  updateTimeline();
}
function formatTime(value) { const n = Math.floor(Number.isFinite(value) ? value : 0); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; }
function updateTimeline() {
  const tile = [...$('tracks').querySelectorAll('.track')].find(t => t.dataset.id === currentId); if (!tile) return;
  const range = tile.querySelector('.seek'); const ready = Number.isFinite(audio.duration) && audio.duration > 0;
  range.disabled = !ready; range.max = ready ? audio.duration : 1;
  range.value = ready ? audio.currentTime : 0;
  range.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} of ${formatTime(audio.duration)}`);
  tile.querySelector('.time-label').textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
}
async function removeTrack(id) {
  try {
    const targetLibrary = library;
    const wasCurrent = currentId === id, wasPlaying = !audio.paused;
    const index = tracks.findIndex(t => t.id === id);
    const remaining = await window.whiteNoise.deleteTrack(id, targetLibrary);
    if (library !== targetLibrary) return;
    tracks = remaining; history = history.filter(t => t !== id);
    if (wasCurrent) {
      audio.pause(); pendingSeek = undefined; audio.onloadedmetadata = null; audio.removeAttribute('src'); audio.load(); currentId = undefined;
      if (tracks.length) select(tracks[Math.min(index, tracks.length - 1)].id, wasPlaying, false);
      else $('playback-status').textContent = library === 'music' ? 'Add your first song from YouTube.' : 'No sounds yet. Add a YouTube link.';
    }
    render(); persist();
  } catch (e) { $('playback-status').textContent = 'Could not delete sound. Please try again.'; }
}
function beginRename(id) {
  document.querySelector('.rename-form')?.remove();
  const track = tracks.find(t => t.id === id);
  const tile = [...$('tracks').querySelectorAll('.track')].find(t => t.dataset.id === id);
  if (!track || !tile) return;
  const form = document.createElement('form'); form.className = 'rename-form';
  const input = document.createElement('input'); input.className = 'rename-input'; input.type = 'text'; input.value = track.title; input.maxLength = 120; input.required = true; input.setAttribute('aria-label', library === 'music' ? 'Track name' : 'Sound name');
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '×'; cancel.setAttribute('aria-label','Cancel rename');
  const close = () => { form.remove(); tile.querySelector('.track-button')?.focus(); };
  cancel.onclick = close;
  form.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
  input.oninput = () => input.setCustomValidity('');
  form.onsubmit = async event => {
    event.preventDefault();
    if (!input.value.trim()) { input.setCustomValidity('Enter a name.'); input.reportValidity(); return; }
    save.disabled = true; cancel.disabled = true; input.disabled = true;
    try {
      const targetLibrary = library;
      const updated = await window.whiteNoise.renameTrack(id, input.value);
      if (library !== targetLibrary) return;
      const existing = tracks.find(t => t.id === id); if (existing) existing.title = updated.title;
      render();
      $('playback-status').textContent = currentId === id && !audio.paused ? (playbackMode === 'loop-one' ? 'Looping · ' : 'Playing · ') + updated.title : 'Renamed to ' + updated.title;
    } catch { save.disabled = false; cancel.disabled = false; input.disabled = false; $('playback-status').textContent = 'Could not rename sound. Please try again.'; input.focus(); }
  };
  form.append(input,save,cancel); tile.append(form); tile.scrollIntoView({block:'nearest'}); input.focus(); input.select();
}
function render() {
  const scroll = $('tracks').scrollTop;
  $('count').textContent = String(tracks.length).padStart(2,'0'); $('tracks').replaceChildren();
  for (const track of tracks) {
    const tile = document.createElement('div'); tile.className = 'track'; tile.dataset.id = track.id; tile.setAttribute('role','listitem');
    const button = document.createElement('button'); button.className = 'track-button';
    const icon = document.createElement('span'); icon.className = 'track-icon'; icon.textContent = library === 'music' ? '♫' : track.id === 'brown' ? '≈' : track.id === 'pink' ? '≋' : '∿';
    const copy = document.createElement('span'); copy.className = 'track-copy';
    const title = document.createElement('span'); title.className = 'track-title'; title.textContent = track.title; title.title = track.title;
    const source = document.createElement('span'); source.className = 'track-source'; source.textContent = track.source || 'Local audio';
    const indicator = document.createElement('span'); indicator.className = 'track-indicator';
    copy.append(title,source); button.append(icon,copy,indicator);
    button.onclick = () => track.id === currentId ? toggle() : select(track.id, true);
    tile.oncontextmenu = async event => { event.preventDefault(); const action = await window.whiteNoise.trackMenu(track.id); if (action === 'delete') await removeTrack(track.id); else if (action === 'rename') beginRename(track.id); };
    button.onkeydown = event => { if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') { event.preventDefault(); tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })); } };
    const timeline = document.createElement('div'); timeline.className = 'timeline';
    const time = document.createElement('span'); time.className = 'time-label';
    const range = document.createElement('input'); range.type = 'range'; range.className = 'seek'; range.min = '0'; range.step = '0.01'; range.setAttribute('aria-label', `Seek ${track.title}`);
    range.oninput = () => { if (currentId === track.id && Number.isFinite(audio.duration)) { audio.currentTime = Math.min(Number(range.value), audio.duration); updateTimeline(); persist(); } };
    timeline.append(time,range); tile.append(button,timeline); $('tracks').append(tile);
  }
  if (!tracks.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = library === 'music' ? 'Your music library is empty. Click Add and paste a YouTube link to add your first song.' : 'Your quiet space starts with a sound. Click Add below.'; $('tracks').append(empty); }
  $('tracks').scrollTop = scroll; controls();
}
function toggle() { if (!currentId) { if (tracks.length) select(tracks[0].id, true); return; } if (audio.paused) void play(); else { audio.pause(); $('playback-status').textContent = 'Paused · take your time.'; } }
async function play() { const playingId = currentId; try { await audio.play(); if (playingId !== currentId) return; $('playback-status').textContent = (playbackMode === 'loop-one' ? 'Looping · ' : 'Playing · ') + tracks.find(t => t.id === currentId)?.title; } catch { if (playingId === currentId) $('playback-status').textContent = 'Unable to play. Try selecting the track again.'; } controls(); }
function select(id, start = true, remember = true, time = 0) {
  const track = tracks.find(t => t.id === id); if (!track) return;
  if (currentId && currentId !== id && remember) history.push(currentId);
  currentId = id;
  pendingSeek = Number.isFinite(time) && time > 0 ? { id, time } : undefined;
  audio.onloadedmetadata = () => {
    if (currentId !== id) return;
    if (pendingSeek && pendingSeek.time < audio.duration) audio.currentTime = pendingSeek.time;
    pendingSeek = undefined; persist();
  };
  audio.src = track.url; controls(); persist(); if (start) void play();
}
function next(direction) {
  if (!tracks.length) return;
  let id;
  if (direction < 0 && playbackMode === 'shuffle' && history.length) id = history.pop();
  else if (playbackMode === 'shuffle' && tracks.length > 1) { const options = tracks.filter(t => t.id !== currentId); id = options[Math.floor(Math.random()*options.length)].id; }
  else id = tracks[(tracks.findIndex(t => t.id === currentId) + direction + tracks.length) % tracks.length].id;
  select(id,true,direction > 0);
}
$('play').onclick = toggle;
$('previous').onclick = () => next(-1); $('next').onclick = () => next(1);
$('playback-mode').onclick = () => {
  playbackMode = playbackModes[(playbackModes.indexOf(playbackMode) + 1) % playbackModes.length];
  audio.loop = playbackMode === 'loop-one'; controls(); persist();
  $('playback-status').textContent = `Playback mode · ${modeNames[playbackMode]}`;
};
audio.addEventListener('ended', () => {
  if (!tracks.length) return;
  if (playbackMode === 'shuffle') { next(1); return; }
  if (playbackMode === 'loop-one') { audio.currentTime = 0; void play(); return; }
  const index = tracks.findIndex(t => t.id === currentId);
  if (index >= 0 && index + 1 < tracks.length) select(tracks[index + 1].id, true);
  else { controls(); persist(); $('playback-status').textContent = library === 'music' ? 'Finished · end of your music list.' : 'Finished · end of your sound list.'; }
});
async function setExpanded(value) {
  expanded = value; $('add-panel').hidden = !expanded; $('expand').setAttribute('aria-expanded', String(expanded)); $('plus').textContent = expanded ? '−' : '+';
  await window.whiteNoise.resize(expanded); if (expanded) $('url').focus();
}
$('expand').onclick = () => { void setExpanded(!expanded); };
$('url').oninput = () => { drafts[library] = $('url').value; };
window.whiteNoise.onProgress(percent => {
  if (!downloadingLibrary) return;
  importStatuses[downloadingLibrary] = { text: `Downloading ${percent} · extracting audio…` }; updateImportForm();
});
$('add-form').onsubmit = async event => {
  event.preventDefault(); if (downloadingLibrary) return;
  const targetLibrary = library, url = $('url').value.trim();
  drafts[targetLibrary] = url; downloadingLibrary = targetLibrary;
  importStatuses[targetLibrary] = { text: 'Connecting to YouTube…' }; updateImportForm();
  try {
    const track = await window.whiteNoise.download(url, targetLibrary);
    drafts[targetLibrary] = ''; importStatuses[targetLibrary] = { text: `Added “${track.title}”.` };
    if (library === targetLibrary) { tracks.push(track); render(); if (!currentId) select(track.id, false); }
  } catch (e) {
    importStatuses[targetLibrary] = { error: true, text: e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') };
  } finally { downloadingLibrary = null; updateImportForm(); }
};
audio.addEventListener('play', () => { controls(); persist(); }); audio.addEventListener('pause', () => { controls(); persist(); });
for (const name of ['timeupdate','loadedmetadata','durationchange','seeked']) audio.addEventListener(name, updateTimeline);
audio.addEventListener('error', () => { $('playback-status').textContent = 'Audio unavailable. Try another sound.'; controls(); });
setInterval(() => { if (!audio.paused) persist(); }, 5000);
window.addEventListener('beforeunload',persist);
(async () => {
  try { tracks = await window.whiteNoise.getTracks(library); updateLibrary(); render(); restoreTrack(true); }
  catch { $('playback-status').textContent = 'Could not load your sound library.'; }
})();
