(async () => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(predicate, message) {
    for (let n = 0; n < 100; n++) { if (predicate()) return; await wait(30); }
    throw new Error(message);
  }
  audio.muted = true;
  assert(library === 'white-noise' && tracks.length === 3, 'White noise defaults changed');
  const ids = tracks.map(t => t.id);
  assert((await window.whiteNoise.getTracks('music')).length === 0, 'Music must start empty');
  $('library-button').click();
  assert(!$('library-menu').hidden && document.activeElement.id === 'choose-white-noise', 'Selector did not open with keyboard focus');
  $('library-menu').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown', bubbles:true}));
  assert(document.activeElement.id === 'choose-music', 'Menu keyboard navigation failed');
  document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}));
  assert($('library-menu').hidden && document.activeElement.id === 'library-button', 'Escape dismissal failed');

  select(ids[1], true);
  await until(() => !audio.paused && audio.readyState >= 2, 'White noise did not play');
  audio.currentTime = 3;
  await until(() => !audio.seeking, 'Seek failed');
  $('playback-mode').click(); // In Order for White noise.
  const noiseMode = playbackMode;
  await setExpanded(true);
  $('url').value = 'https://youtu.be/noise-draft';
  $('library-button').click(); $('choose-music').click();
  await until(() => library === 'music' && !switching, 'Music choice did not switch');
  assert(audio.paused && !audio.getAttribute('src'), 'Switch did not stop outgoing audio');
  assert(!tracks.length && $('play').disabled && $('previous').disabled && $('next').disabled, 'Empty Music controls wrong');
  assert($('tracks').textContent.includes('first song') && $('library-title').textContent === 'Music', 'Music empty state missing');
  assert(!expanded && $('add-panel').hidden && !$('url').value, 'Import panel or draft leaked between libraries');
  assert(playbackMode === 'in-order', 'Music should default to In Order');
  $('playback-mode').click(); // Shuffle only in Music.
  const musicMode = playbackMode;
  await setExpanded(true);
  $('url').value = 'https://youtu.be/music-draft';
  $('volume').value = 37; $('volume').dispatchEvent(new Event('input'));
  await switchLibrary('white-noise');
  assert(tracks.map(t => t.id).join() === ids.join() && currentId === ids[1], 'White noise selection or library lost');
  assert(playbackMode === noiseMode && audio.paused, 'White noise mode or paused state lost');
  await until(() => Math.abs(audio.currentTime - 3) < .2, 'White noise playback position lost');
  assert($('url').value === 'https://youtu.be/noise-draft' && audio.volume === .37, 'Draft or app volume lost');
  assert(history.length === 0, 'Shuffle history leaked');
  await switchLibrary('music');
  assert(playbackMode === musicMode && $('url').value === 'https://youtu.be/music-draft', 'Music state lost');
  assert(JSON.parse(localStorage.getItem('playback:white-noise')).id === ids[1], 'White noise state overwritten');
  assert(localStorage.getItem('active-library') === 'music', 'Active library not saved');
  let rejected = false;
  try { await window.whiteNoise.deleteTrack(ids[0], 'music'); } catch { rejected = true; }
  assert(rejected && (await window.whiteNoise.getTracks('white-noise')).length === 3, 'Cross-library delete should fail');
  rejected = false; try { await window.whiteNoise.getTracks('other'); } catch { rejected = true; }
  assert(rejected, 'Invalid library accepted');
  await setExpanded(true);
  return {emptyMusic:true,menu:true,keyboard:true,independentLibraries:true,independentPlayback:true,positions:true,sharedVolume:true,drafts:true,crossLibraryDeleteProtection:true};
})()
