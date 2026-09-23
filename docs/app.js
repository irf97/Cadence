import {Hand,modes,guides,fingers,note,measurements} from './engine.js';
import {InstrumentAudio} from './audio.js';
const $=id=>document.getElementById(id),video=$('video'),canvas=$('canvas'),ctx=canvas.getContext('2d'),audio=new InstrumentAudio();
let selection='baseline',mode='baseline',stage=0,unique=new Set(),points=0,played=0,finished=false;
let controls={Left:new Hand(),Right:new Hand()},hits={},hands=[],stream=null,worker=null,busy=false,running=false,paused=false,generation=0,lastResult=0,lastVideo=-1,fps=0,lastFrame=0;
const timers={},history={},colors={Left:'#74e1dc',Right:'#ff709b'};
const target=()=>mode==='conductor'?5:6;
function silence(){audio.quiet(false);for(const timer of Object.values(timers))clearTimeout(timer);controls={Left:new Hand(),Right:new Hand()};hits={};hands=[];}
function reset(){silence();selection=$('mode').value;mode=selection==='journey'?'baseline':selection;stage=0;unique=new Set();points=played=0;finished=false;guide();}
function guide(){
 $('instruction').textContent=guides[mode];$('journey').hidden=selection!=='journey';$('guide').replaceChildren();
 if(mode==='baseline')for(const part of ['distal','lower'])for(const hand of ['Left','Right'])for(const finger of fingers){const value=note(mode,hand,`${finger}:${part}`),button=document.createElement('button');button.textContent=`${hand[0]} ${finger} ${part==='distal'?'tip':'lower'} · ${value.name}`;button.style.color=part==='distal'?'#74e1dc':'#b9a1ff';button.onclick=()=>audio.audition(value).catch(showError);$('guide').append(button);}
 else if(mode==='finger_count'){const text=document.createElement('p');text.textContent='32 shapes per hand · dots: thumb / index / middle / ring / little. Left C2–G4 · right G♯4–D♯7. A fist is also a note.';$('guide').append(text);}
 else for(let lane=0;lane<(mode==='conductor'?5:8);lane++){const text=document.createElement('span');text.textContent=note(mode,'Left',String(lane)).name+' / '+note(mode,'Right',String(lane)).name;$('guide').append(text);}
}
function showError(error){$('error').textContent=error.message||String(error);}
function stop(){generation++;running=false;busy=false;worker?.terminate();worker=null;stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;silence();$('welcome').hidden=false;$('start').disabled=false;$('start').textContent='Start camera & sound';$('stop').disabled=true;$('pause').disabled=true;$('status').textContent='Camera off';}
async function start(){
 stop();const current=generation;$('error').textContent='';$('start').disabled=true;$('start').textContent='Opening camera…';
 try{
  await audio.init();
  const capture=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30},facingMode:'user'},audio:false});
  if(current!==generation){capture.getTracks().forEach(track=>track.stop());return;}
  stream=capture;video.srcObject=stream;await video.play();
  if(current!==generation)return;
  $('start').textContent='Loading hand tracking…';worker=new Worker(new URL('./tracker.js',import.meta.url));
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Hand tracker took too long to load. Retry the camera.')),45000);worker.onmessage=({data})=>{clearTimeout(timeout);data.type==='ready'?resolve():reject(new Error(data.message||'Tracker failed'));};worker.onerror=event=>{clearTimeout(timeout);reject(new Error(event.message||'Tracker failed'));};worker.postMessage({type:'init'});});
  if(current!==generation)return;
  worker.onmessage=({data})=>{if(current!==generation)return;busy=false;if(data.type==='error'){stop();showError(new Error(data.message));return;}receive(data.result,data.timestamp);};
  worker.onerror=event=>{stop();showError(new Error(event.message||'Tracking stopped. Retry camera.'));};
  running=true;paused=false;lastVideo=-1;lastResult=performance.now();$('pause').textContent='Pause';$('welcome').hidden=true;$('stop').disabled=false;$('pause').disabled=false;
 }catch(error){if(current===generation){stop();showError(error);}}
}
function receive(result,timestamp){
 const now=performance.now();lastResult=now;
 if(paused||finished||now-timestamp>250){silence();return;}
 fps=lastFrame?.9*fps+.1*1000/Math.max(1,now-lastFrame):0;lastFrame=now;
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
 for(const hand of ['Left','Right']){const control=controls[hand],hit=hits[hand];$(hand.toLowerCase()).textContent=`${hand.toUpperCase()} · ${paused?'Paused':hit&&(control.active!==null||now/1000<control.until)?hit.name+' · PLAYING':running?'Ready':'Camera off'}\n${control.hint}`;}
 $('score').textContent=`${points} points · ${played} notes`;$('next').disabled=unique.size<target()||finished;$('next').textContent=stage===3?'Finish composition':'Next movement';$('challenge').textContent=finished?'Composition complete · all four instruments explored!':`Movement ${stage+1}/4 · ${modes[mode]} · ${Math.min(target(),unique.size)}/${target()} different inputs`;
 if(running)$('status').textContent=paused?'PAUSED':finished?'COMPLETE':'LIVE CAMERA';$('metrics').textContent=`${fps.toFixed(1)} tracking fps · audio estimate: ${audio.latency??'—'} ms · ${audio.buffers.size===4?'sampled piano':'synthesis fallback'}. Component estimates, not total input latency.`;
}
$('start').onclick=start;$('stop').onclick=stop;$('mode').onchange=reset;$('restart').onclick=reset;
$('pause').onclick=()=>{paused=!paused;silence();$('pause').textContent=paused?'Resume':'Pause';};
$('next').onclick=()=>{if(unique.size<target()||finished)return;silence();if(stage===3)finished=true;else{stage++;mode=Object.keys(modes)[stage];unique=new Set();guide();}};
$('sound').onclick=()=>audio.audition(note('air_keys','Left','0')).catch(showError);$('palette').onchange=()=>{audio.palette=$('palette').value;silence();};$('volume').oninput=()=>audio.setVolume(Number($('volume').value)/100);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){paused=true;silence();$('pause').textContent='Resume';}});window.addEventListener('pagehide',stop);
setInterval(()=>{if(running&&performance.now()-lastResult>300)silence();},100);
guide();requestAnimationFrame(frame);
