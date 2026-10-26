(async () => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const wait = ms=>new Promise(resolve=>setTimeout(resolve,ms));
  for(let n=0;n<100 && Math.abs(audio.currentTime-2.3)>.2;n++)await wait(30);
  assert(library === 'music' && tracks.length === 1 && tracks[0].title === 'My music', 'Music library or active mode did not survive restart');
  assert(playbackMode === 'shuffle' && audio.paused && Math.abs(audio.currentTime-2.3)<.2 && audio.volume === .28, 'Music playback state did not survive restart');
  await removeTrack(tracks[0].id);
  assert(tracks.length === 0 && $('play').disabled && !currentId, 'Deleting final music track failed');
  await switchLibrary('white-noise');
  assert(tracks.length === 2 && tracks.some(t=>t.id==='legacy'), 'Deleting Music damaged White noise');
  await switchLibrary('music'); await setExpanded(true);
  return {restart:true,rememberedLibrary:true,rememberedMusic:true,rememberedPosition:true,lastTrackDeletion:true,noisePreserved:true};
})()
