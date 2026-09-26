(async () => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(predicate, message) {
    for (let n = 0; n < 100; n++) { if (predicate()) return; await wait(40); }
    throw new Error(message);
  }
  const button = $('playback-mode');
  function mode(value) { for (let i = 0; playbackMode !== value && i < 3; i++) button.click(); assert(playbackMode === value, 'Mode did not switch'); }
  async function start(id) {
    select(id, true);
    await until(() => !audio.paused && audio.readyState >= 2 && Number.isFinite(audio.duration), 'Audio did not start');
  }
  async function nearEnd() {
    audio.currentTime = audio.duration - .18;
    await until(() => !audio.seeking, 'Seek did not finish');
  }
  audio.muted = true;
  const ids = tracks.map(t => t.id);
  assert(ids.length === 3, 'Expected isolated three-sound library');
  let endedCount = 0; audio.addEventListener('ended', () => endedCount++);

  // Use real decoded audio reaching its end; do not synthesize ended events.
  mode('loop-one'); await start(ids[0]); await nearEnd(); await wait(600);
  assert(currentId === ids[0] && !audio.paused && audio.currentTime < 2, 'Loop One did not repeat');
  assert(endedCount === 0 && audio.loop, 'Loop One should use native seamless looping');

  mode('shuffle'); assert(!audio.loop, 'Shuffle must allow ended events');
  for (let i = 0; i < 3; i++) {
    const previous = currentId; const count = endedCount; await nearEnd();
    await until(() => currentId !== previous && !audio.paused && audio.readyState >= 2, 'Shuffle did not start a different sound');
    assert(endedCount > count, 'Shuffle was not triggered by natural completion');
  }

  mode('in-order'); await start(ids[0]);
  for (const id of ids.slice(1)) { await nearEnd(); await until(() => currentId === id && !audio.paused && audio.readyState >= 2, 'In Order skipped or failed to advance'); }
  await nearEnd(); await until(() => audio.ended && audio.paused, 'In Order did not stop at list end');
  assert(currentId === ids[2] && $('play').getAttribute('aria-label') === 'Play', 'Final sound state is wrong');

  await start(ids[0]); audio.currentTime = 4;
  const src = audio.src; const icons = new Set();
  for (const expected of ['shuffle','loop-one','in-order']) {
    button.click(); icons.add(button.innerHTML);
    assert(playbackMode === expected && audio.src === src && audio.currentTime >= 4 && !audio.paused, 'Cycling modes interrupted playback');
    assert(button.getAttribute('aria-label').includes(modeNames[expected]), 'Mode accessibility label is wrong');
  }
  assert(icons.size === 3, 'Modes must have distinct icons');
  assert(JSON.parse(localStorage.getItem('playback')).mode === 'in-order', 'Mode not persisted');

  tracks = [tracks[0]]; render(); mode('shuffle'); await nearEnd(); const count = endedCount;
  await until(() => endedCount > count && !audio.paused && audio.currentTime < 2, 'Single-sound shuffle did not repeat');
  mode('in-order'); await nearEnd(); await until(() => audio.ended && audio.paused, 'Single-sound In Order did not stop');
  tracks = []; currentId = undefined; audio.removeAttribute('src'); audio.load(); render(); button.click();
  assert($('play').disabled, 'Empty library should disable playback');
  return {loopOne:true,shuffle:true,inOrder:true,stopsAtEnd:true,modeCycle:true,distinctIcons:true,persistence:true,singleSound:true,emptyLibrary:true,realAudioCompletion:true};
})()
