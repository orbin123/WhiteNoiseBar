(async () => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
  async function until(predicate, message) { for (let n=0;n<100;n++) {if(predicate())return;await wait(30);}throw new Error(message); }
  async function add() {
    await setExpanded(true); $('url').value = 'https://youtu.be/test';
    await $('add-form').onsubmit(new Event('submit',{cancelable:true}));
  }
  audio.muted = true;
  assert(tracks.length === 1 && tracks[0].id === 'legacy' && tracks[0].library === 'white-noise', 'Legacy library was not migrated without reseeding');
  assert((await window.whiteNoise.getTracks('music')).length === 0, 'Legacy sounds leaked into Music');
  localStorage.setItem('playback', JSON.stringify({id:'legacy',time:2,mode:'shuffle',volume:.6}));
  localStorage.removeItem('playback:white-noise'); loadPlayback();
  assert(saved.id === 'legacy' && saved.time === 2 && playbackMode === 'shuffle', 'Legacy playback migration failed');
  restoreTrack();
  await switchLibrary('music'); await setExpanded(true);
  $('url').value = 'https://youtu.be/test';
  const pending = $('add-form').onsubmit(new Event('submit',{cancelable:true}));
  await switchLibrary('white-noise');
  assert($('submit').disabled, 'Concurrent import should be disabled');
  await pending;
  assert(tracks.length === 1 && tracks[0].id === 'legacy', 'Pending Music import appeared in White noise');
  assert((await window.whiteNoise.getTracks('music')).length === 1, 'Music import destination was lost');
  await switchLibrary('music');
  assert(tracks.length === 1 && currentId === tracks[0].id, 'First Music import was not selectable');
  $('play').click(); await until(() => !audio.paused && audio.readyState >= 2, 'Imported audio did not play');
  audio.pause();
  const musicId = currentId;
  beginRename(musicId); document.querySelector('.rename-input').value = 'My music';
  await document.querySelector('.rename-form').onsubmit(new Event('submit',{cancelable:true}));
  assert(tracks[0].title === 'My music', 'Music rename failed');
  await add(); assert(tracks.length === 2, 'Second music import failed');
  await removeTrack(tracks[1].id);
  assert(tracks.length === 1 && tracks[0].id === musicId, 'Music deletion failed');
  await switchLibrary('white-noise'); await add();
  assert(tracks.length === 2 && tracks.every(t=>t.library === 'white-noise'), 'White noise import classification failed');
  assert((await window.whiteNoise.getTracks('music'))[0].title === 'My music', 'Music changed during White noise import');
  await switchLibrary('music');
  await until(() => audio.readyState >= 2, 'Music did not load');
  audio.currentTime = 2.3; await until(() => !audio.seeking, 'Music seek failed');
  $('playback-mode').click(); // In Order -> Shuffle.
  $('volume').value = 28; $('volume').dispatchEvent(new Event('input')); persist();
  await setExpanded(false);
  return {legacyMigration:true,legacyPlayback:true,importWhileSwitching:true,correctDestinations:true,firstSongPlayable:true,rename:true,delete:true,readyForRestart:true};
})()
