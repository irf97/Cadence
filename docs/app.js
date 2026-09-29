import {Hand,modes,guides,fingers,note,measurements,journeyModes} from './engine.js';
import {InstrumentAudio} from './audio.js';
import {BodyPercussion,bodyObservation} from './body-engine.js';
import {BodyMusic,ode} from './body-music.js';
import {drawBody,padLabel} from './body-view.js';
import {readMidi} from './midi.js';
const $=id=>document.getElementById(id),video=$('video'),canvas=$('canvas'),ctx=canvas.getContext('2d'),audio=new InstrumentAudio();
const body=new BodyPercussion(),music=new BodyMusic();
let bodyHit=null,importedTracks=[],importedName='',midiGeneration=0,opening=false,trackerMode=null,previewGeneration=0;
let selection='body',mode='body',stage=0,unique=new Set(),points=0,played=0,finished=false;
let controls={Left:new Hand(),Right:new Hand()},hits={},hands=[],stream=null,worker=null,busy=false,running=false,paused=false,generation=0,lastResult=0,lastVideo=-1,fps=0,lastFrame=0;
const timers={},history={},colors={Left:'#74e1dc',Right:'#ff709b'};
const target=()=>mode==='conductor'?5:6;
function silence(){previewGeneration++;audio.quiet(false);for(const timer of Object.values(timers))clearTimeout(timer);for(const pad of document.querySelectorAll('.body-pad.played'))pad.classList.remove('played');controls={Left:new Hand(),Right:new Hand()};hits={};hands=[];body.reset();bodyHit=null;for(const key of Object.keys(history))delete history[key];}
function reset(){const wasActive=running||opening;silence();selection=$('mode').value;mode=selection==='journey'?'baseline':selection;stage=0;unique=new Set();points=played=0;finished=false;music.reset();guide();if(wasActive&&trackerMode!==(mode==='body'?'body':'hands'))start();}
function guide(){
 $('instruction').textContent=guides[mode];$('journey').hidden=selection!=='journey';$('guide').replaceChildren();
 $('body-controls').hidden=mode!=='body';$('palette-label').hidden=mode==='body';$('guide').classList.toggle('body-guide',mode==='body');
 $('welcome-tip').textContent=mode==='body'?'Hands together. Forearm taps. Music.':'One camera. Both hands. No calibration.';
 if(mode==='body'){bodyGuide();return;}
 if(mode==='baseline')for(const part of ['distal','lower'])for(const hand of ['Left','Right'])for(const finger of fingers){const value=note(mode,hand,`${finger}:${part}`),button=document.createElement('button');button.textContent=`${hand[0]} ${finger} ${part==='distal'?'tip':'lower'} · ${value.name}`;button.style.color=part==='distal'?'#74e1dc':'#b9a1ff';button.onclick=()=>audio.audition(value).catch(showError);$('guide').append(button);}
 else if(mode==='finger_count'){const text=document.createElement('p');text.textContent='32 shapes per hand · dots: thumb / index / middle / ring / little. Left C2–G4 · right G♯4–D♯7. A fist is also a note.';$('guide').append(text);}
 else for(let lane=0;lane<(mode==='conductor'?5:8);lane++){const text=document.createElement('span');text.textContent=note(mode,'Left',String(lane)).name+' / '+note(mode,'Right',String(lane)).name;$('guide').append(text);}
}
function bodyGuide(){
 $('guide').replaceChildren();
 for(const hand of ['Left','Right']){const label=document.createElement('span');label.className='arm-label '+hand.toLowerCase();label.textContent=hand.toUpperCase()+' ARM · WRIST → ELBOW';$('guide').append(label);}
 for(let index=0;index<8;index++){const button=document.createElement('button');button.className='body-pad';button.dataset.pad=index;button.textContent=padLabel(music.preset,index);button.setAttribute('aria-label',`${index<4?'Left':'Right'} forearm zone ${index%4+1}: ${padLabel(music.preset,index)}`);button.onclick=()=>previewBody(index);$('guide').append(button);}
 const caption=document.createElement('p');caption.className='pad-caption';caption.textContent='Tap a pad to try its sound. Camera: use the matching zone on your forearm.';$('guide').append(caption);
 $('song-controls').hidden=music.preset!=='song';
 const descriptions={drums:'Upward hand tap: kick. Downward hand tap: snare. Forearms: hi-hat, snare, tom, kick.',jazz:'Each tap plays a jazz piano chord with a bass note. Your hands set the groove.',classical:'Play a C-major scale across both forearms with piano and strings. Hands together: higher position, higher note.',solfege:'Left arm: Do Re Mi Fa. Right arm: Sol La Si Do. Hands together: higher position, higher note.',song:'Every tap advances one note or chord. The melody follows your rhythm.'};
 $('body-description').textContent=descriptions[music.preset];songStatus();
}
function songStatus(){const total=music.song.groups.length,count=music.position===0?0:music.loop?(music.position-1)%total+1:Math.min(music.position,total);$('song-status').textContent=`${music.song.name} · ${count} / ${total}${!music.loop&&music.position>=total?' · Complete — Rewind to play again':''}`;}
function playBody(event){
 const sound=music.play(event);if(!sound){songStatus();return;}audio.strike(sound);played++;points+=10;
 bodyHit={cursor:event.cursor,label:sound.label,time:performance.now()};
 const pad=event.kind==='forearm'?document.querySelector(`[data-pad="${event.index}"]`):null;if(pad){pad.classList.add('played');clearTimeout(timers['pad'+event.index]);timers['pad'+event.index]=setTimeout(()=>pad.classList.remove('played'),150);}
 songStatus();
}
async function previewBody(index){
 try{const current=previewGeneration;await audio.init();if(current!==previewGeneration||mode!=='body'||paused||document.hidden)return;
 playBody({kind:'forearm',hand:index<4?'Right':'Left',target:index<4?'Left':'Right',zone:index%4,index,expression:.65,cursor:[index<4?.3:.7,.5]});}catch(error){showError(error);}
}
function showError(error){$('error').textContent=error.message||String(error);}
function stop(){generation++;opening=false;running=false;paused=false;busy=false;worker?.terminate();worker=null;stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;silence();$('welcome').hidden=false;$('start').disabled=false;$('start').textContent='Start camera & sound';$('stop').disabled=true;$('pause').disabled=true;$('status').textContent='Camera off';}
async function start(){
 stop();const current=generation;opening=true;trackerMode=mode==='body'?'body':'hands';const requestedMode=trackerMode;$('error').textContent='';$('start').disabled=true;$('start').textContent='Opening camera…';$('stop').disabled=false;
 try{
  await audio.init();
  if(current!==generation)return;
  const capture=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30},facingMode:'user'},audio:false});
  if(current!==generation){capture.getTracks().forEach(track=>track.stop());return;}
  stream=capture;video.srcObject=stream;await video.play();
  if(current!==generation)return;
  canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);
  $('start').textContent=requestedMode==='body'?'Loading arm tracking…':'Loading hand tracking…';worker=new Worker(new URL('./tracker.js',import.meta.url));
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Tracker took too long to load. Retry the camera.')),45000);worker.onmessage=({data})=>{clearTimeout(timeout);data.type==='ready'?resolve():reject(new Error(data.message||'Tracker failed'));};worker.onerror=event=>{clearTimeout(timeout);reject(new Error(event.message||'Tracker failed'));};worker.postMessage({type:'init',mode:requestedMode});});
  if(current!==generation)return;
  worker.onmessage=({data})=>{if(current!==generation)return;busy=false;if(data.type==='error'){stop();showError(new Error(data.message));return;}receive(data.result,data.timestamp);};
  worker.onerror=event=>{stop();showError(new Error(event.message||'Tracking stopped. Retry camera.'));};
  opening=false;running=true;paused=false;lastVideo=-1;lastFrame=0;fps=0;lastResult=performance.now();$('pause').textContent='Pause';$('welcome').hidden=true;$('stop').disabled=false;$('pause').disabled=false;
 }catch(error){if(current===generation){stop();showError(error);}}
}
function receive(result,timestamp){
 const now=performance.now();lastResult=now;
 if(paused||finished||now-timestamp>250){silence();return;}
 fps=lastFrame?.9*fps+.1*1000/Math.max(1,now-lastFrame):0;lastFrame=now;
 if(mode==='body'){const observation=bodyObservation(result.poseLandmarks,video.videoWidth/video.videoHeight);for(const event of body.update(observation,timestamp/1000))playBody(event);return;}
 hands=[];const used=new Set();
 for(let index=0;index<result.landmarks.length;index++){
  const image=result.landmarks[index].map(point=>[1-point.x,point.y]),label=result.handedness[index][0];
  let hand=label.categoryName==='Left'?'Right':'Left';
  const nearby=Object.entries(history).filter(([name,old])=>!used.has(name)&&timestamp-old.time<200).map(([name,old])=>({name,distance:Math.hypot(image[0][0]-old.wrist[0],image[0][1]-old.wrist[1])})).sort((a,b)=>a.distance-b.distance)[0];
  if(nearby&&nearby.distance<.12&&(label.score<.85||used.has(hand)))hand=nearby.name;
  if(used.has(hand))continue;used.add(hand);
  let world=result.worldLandmarks[index].map(point=>[point.x,point.y,point.z]);const old=history[hand];
  if(old&&timestamp-old.time<180){const dt=Math.max(.001,(timestamp-old.time)/1000),speed=world.reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-old.world[i][j])),0)/21/dt,tau=.025/(1+8*speed),weight=dt/(tau+dt);world=world.map((point,i)=>point.map((v,j)=>weight*v+(1-weight)*old.world[i][j]));}
  history[hand]={time:timestamp,wrist:image[0],world};hands.push({hand,points:image,confidence:label.score,control:measurements(world,image)});
 }
 for(const hand of ['Left','Right']){
  const observation=hands.find(item=>item.hand===hand),control=controls[hand];
  for(const [kind,key] of control.update(mode,observation,timestamp/1000)){
   if(kind==='off'){audio.off(hand);clearTimeout(timers[hand]);}
   else{
    const value=note(mode,hand,key);audio.on(hand,value);clearTimeout(timers[hand]);if(mode==='conductor')timers[hand]=setTimeout(()=>audio.off(hand),550);
    played++;const id=`${hand}:${key}`;if(selection!=='journey')points+=10;else if(!unique.has(id)&&unique.size<target())points+=100;unique.add(id);hits[hand]={...value,time:now,cursor:[...control.cursor]};
   }
  }
 }
}
async function frame(){
 if(running&&!paused&&!finished&&!busy&&video.readyState>=2&&video.currentTime!==lastVideo){
  busy=true;lastVideo=video.currentTime;const current=generation,timestamp=performance.now();
  try{const bitmap=await createImageBitmap(video);if(current===generation&&worker)worker.postMessage({type:'frame',bitmap,timestamp},[bitmap]);else bitmap.close();}catch(error){busy=false;showError(error);}
 }
 draw();requestAnimationFrame(frame);
}
function draw(){
 const width=canvas.width,height=canvas.height,now=performance.now(),circle=(point,r)=>{ctx.beginPath();ctx.arc(point[0]*width,point[1]*height,r,0,Math.PI*2);ctx.stroke();};
 ctx.fillStyle='#171b2a';ctx.fillRect(0,0,width,height);
 if(running&&video.readyState>=2){ctx.save();ctx.translate(width,0);ctx.scale(-1,1);ctx.drawImage(video,0,0,width,height);ctx.restore();}
 const lanes=mode==='conductor'?5:8;
 if(mode==='air_keys'||mode==='conductor')for(let lane=0;lane<lanes;lane++){ctx.fillStyle=['#74e1dc22','#b9a1ff22','#ff709b22'][lane%3];ctx.fillRect(lane*width/lanes,36,width/lanes,height-36);ctx.strokeStyle='#68708c';ctx.lineWidth=1;ctx.strokeRect(lane*width/lanes,36,width/lanes,height-36);ctx.fillStyle='white';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillText(note(mode,'Left',String(lane)).name+' / '+note(mode,'Right',String(lane)).name,(lane+.5)*width/lanes,height-20);}
 ctx.textAlign='left';
 if(mode==='body')drawBody(ctx,width,height,body,music,now,bodyHit);
 for(const observation of hands){const hand=observation.hand,control=controls[hand],color=colors[hand],points=observation.points;
  const line=(a,b)=>{ctx.beginPath();ctx.moveTo(a[0]*width,a[1]*height);ctx.lineTo(b[0]*width,b[1]*height);ctx.stroke();};ctx.strokeStyle=color;ctx.lineWidth=3;
  for(const base of [1,5,9,13,17]){line(points[0],points[base]);for(let offset=0;offset<3;offset++)line(points[base+offset],points[base+offset+1]);}
  if(mode==='baseline')fingers.forEach((finger,index)=>{for(let segment=0;segment<3;segment++){const part=segment===2?'distal':'lower';ctx.strokeStyle=control.active===`${finger}:${part}`?'white':part==='distal'?'#74e1dc':'#b9a1ff';ctx.lineWidth=control.active===`${finger}:${part}`?13:8;line(points[5+index*4+segment],points[6+index*4+segment]);}});
  if(mode==='finger_count')control.bits?.forEach((extended,index)=>{ctx.strokeStyle=extended?'white':color;ctx.lineWidth=extended?7:2;circle(points[4+index*4],9);});
  const sounding=control.active!==null||now/1000<control.until;ctx.strokeStyle=sounding?'white':color;ctx.lineWidth=sounding?5:3;circle(control.cursor,sounding?22:14);
  if(mode==='conductor'&&control.line!==null){ctx.setLineDash([10,7]);line([Math.max(0,control.cursor[0]-.09),control.line],[Math.min(1,control.cursor[0]+.09),control.line]);ctx.setLineDash([]);}
  if((mode==='conductor'||mode==='air_keys')&&control.lane!==null){const selected=control.active!==null?Number(control.active):control.lane;ctx.strokeStyle=color;ctx.strokeRect(selected*width/lanes,36,width/lanes,height-36);if(sounding){ctx.fillStyle=color+'44';ctx.fillRect(selected*width/lanes,36,width/lanes,height-36);}}
  const left=Math.max(6,Math.min(width-290,control.cursor[0]*width-80)),top=Math.max(80,Math.min(height-75,control.cursor[1]*height+42));ctx.fillStyle=color;ctx.font='bold 18px sans-serif';ctx.fillText(control.hint,left,top);if(mode!=='finger_count'){ctx.fillStyle='#35394c';ctx.fillRect(left,top+10,120,7);ctx.fillStyle=color;ctx.fillRect(left,top+10,120*control.progress,7);}
  const hit=hits[hand];if(hit&&now-hit.time<600){ctx.strokeStyle=color;circle(hit.cursor,25+(now-hit.time)/10);ctx.font='bold 32px sans-serif';ctx.fillStyle=color;ctx.fillText(hit.name,hit.cursor[0]*width+25,hit.cursor[1]*height-20);}
 }
 for(const hand of ['Left','Right']){const control=controls[hand],hit=hits[hand];const bodyLabels=music.preset==='song'?'Tap to advance melody':Array.from({length:4},(_,i)=>padLabel(music.preset,i+(hand==='Right'?4:0))).join(' · ');$(hand.toLowerCase()).textContent=mode==='body'?`${hand.toUpperCase()} ARM · ${paused?'Paused':body.arms[hand]?'Tracked':running?'Show elbow & hand':'Camera off'}\n${bodyHit&&now-bodyHit.time<600?bodyHit.label:bodyLabels}`:`${hand.toUpperCase()} · ${paused?'Paused':hit&&(control.active!==null||now/1000<control.until)?hit.name+' · PLAYING':running?'Ready':'Camera off'}\n${control.hint}`;}
 $('score').textContent=mode==='body'?`${played} taps`:`${points} points · ${played} notes`;$('next').disabled=unique.size<target()||finished;$('next').textContent=stage===3?'Finish composition':'Next movement';$('challenge').textContent=finished?'Composition complete · all four instruments explored!':`Movement ${stage+1}/4 · ${modes[mode]} · ${Math.min(target(),unique.size)}/${target()} different inputs`;
 if(running)$('status').textContent=paused?'PAUSED':finished?'COMPLETE':'LIVE CAMERA';$('metrics').textContent=`${fps.toFixed(1)} tracking fps · audio estimate: ${audio.latency??'—'} ms · ${audio.buffers.size===4?'sampled piano':'synthesis fallback'}. Component estimates, not total input latency.`;
}
$('start').onclick=start;$('stop').onclick=stop;$('mode').onchange=reset;$('restart').onclick=reset;
$('pause').onclick=()=>{paused=!paused;silence();$('pause').textContent=paused?'Resume':'Pause';};
$('next').onclick=()=>{if(unique.size<target()||finished)return;silence();if(stage===3)finished=true;else{stage++;mode=journeyModes[stage];unique=new Set();guide();}};
$('sound').onclick=()=>mode==='body'?previewBody(3):audio.audition(note('air_keys','Left','0')).catch(showError);$('palette').onchange=()=>{audio.palette=$('palette').value;silence();};$('volume').oninput=()=>audio.setVolume(Number($('volume').value)/100);
for(const button of document.querySelectorAll('[data-preset]'))button.onclick=()=>{silence();music.preset=button.dataset.preset;for(const tab of document.querySelectorAll('[data-preset]'))tab.setAttribute('aria-pressed',String(tab===button));bodyGuide();};
$('body-sensitivity').oninput=()=>{body.sensitivity=Number($('body-sensitivity').value)/100;body.reset();$('sensitivity-value').textContent=$('body-sensitivity').value+'%';};
$('song-loop').onchange=()=>{music.loop=$('song-loop').checked;songStatus();};
$('song-reset').onclick=()=>{silence();music.reset();songStatus();};
function chooseSong(){silence();const imported=$('song-choice').value==='import';$('track-label').hidden=!imported;music.setSong(imported?{...importedTracks[Number($('midi-track').value)],name:importedName+' · '+importedTracks[Number($('midi-track').value)].name}:ode);songStatus();}
$('song-choice').onchange=chooseSong;$('midi-track').onchange=chooseSong;
$('midi-file').onchange=async()=>{const file=$('midi-file').files[0];if(!file)return;const current=++midiGeneration;
 try{if(file.size>4*1024*1024)throw new Error('Choose a MIDI file smaller than 4 MB.');const tracks=readMidi(await file.arrayBuffer());if(current!==midiGeneration)return;
 importedTracks=tracks;importedName=file.name.replace(/\.midi?$/i,'');$('midi-track').replaceChildren();tracks.forEach((track,i)=>{const option=new Option(`${track.name} · ${track.groups.length} taps`,String(i));$('midi-track').append(option);});
 let option=$('song-choice').querySelector('[value="import"]');if(!option){option=new Option(importedName,'import');$('song-choice').append(option);}option.textContent=importedName;$('song-choice').value='import';chooseSong();$('error').textContent='';
 }catch(error){if(current===midiGeneration)showError(error);}finally{if(current===midiGeneration)$('midi-file').value='';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){silence();audio.quiet();if(running){paused=true;$('pause').textContent='Resume';}else if(opening)stop();}});window.addEventListener('pagehide',stop);
setInterval(()=>{if(running&&performance.now()-lastResult>300)silence();},100);
guide();requestAnimationFrame(frame);
