(async () => {
 const assert = (ok, text) => { if (!ok) throw new Error(text); };
 audio.muted = true; await audio.play();
 const src = audio.src; const button = $('volume-button'); const slider = $('volume');
 button.click(); assert(!$('volume-panel').hidden, 'Volume panel did not open');
 for (const level of [25, 0, 100, 42]) {
   slider.value = level; slider.dispatchEvent(new Event('input'));
   assert(audio.volume === level / 100 && $('volume-value').textContent === `${level}%`, 'Wrong app volume');
   assert(audio.src === src && !audio.paused, 'Volume interrupted playback');
   assert(JSON.parse(localStorage.getItem('playback')).volume === level / 100, 'Volume not saved');
 }
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
 assert($('volume-panel').hidden, 'Escape did not dismiss volume');
 button.click(); $('playback-status').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
 assert($('volume-panel').hidden, 'Outside click did not dismiss volume');
 audio.pause(); button.click(); await new Promise(r=>setTimeout(r,200));
 return {appVolume:true,mute:true,persisted:true,playbackPreserved:true,popoverDismissal:true};
})()
