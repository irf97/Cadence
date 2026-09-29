export const modes = {baseline:'Phalanges · 2 zones',finger_count:'Finger combinations',conductor:'Conductor',air_keys:'Air keys',body:'Body percussion'};
export const journeyModes = ['baseline','finger_count','conductor','air_keys'];
export const guides = {
 body:'Keep elbows and hands in view. Tap your hands together, or tap across the opposite inner forearm. Separate between taps. Gentle contact is enough.',
 baseline:'Open your thumb, then touch a finger. Cyan tip = high note; lilac lower segments = low note. Hold to sustain.',
 finger_count:'Hold any finger shape to play. Every five-finger combination has its own note—including a fist. Hide your hand or pause to silence.',
 conductor:'Choose a wide lane with your palm. Lift until READY, then move down through the dashed strike line.',
 air_keys:'The circle between thumb and index chooses the note. Open, pinch your finger pads, and hold. Open to release.'
};
export const fingers=['index','middle','ring','little'];
const scaleNotes=[0,2,4,5,7,9,11,12];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=a=>Math.hypot(...a);
const distance=(a,b)=>norm(sub(a,b));
const mix=(a,b,t)=>a.map((v,i)=>v*t+b[i]*(1-t));
const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
function closest(point,start,end){const direction=sub(end,start),offset=sub(point,start);const t=clip(offset.reduce((s,v,i)=>s+v*direction[i],0)/Math.max(1e-12,direction.reduce((s,v)=>s+v*v,0)),0,1);return start.map((v,i)=>v+t*direction[i]);}
export function measurements(world,image){
 if(world.length!==21||image.length!==21||!world.flat().every(Number.isFinite)||!image.flat().every(Number.isFinite))return null;
 const scale=(distance(world[5],world[17])+distance(world[0],world[9]))/2, screenScale=(distance(image[5],image[17])+distance(image[0],image[9]))/2;
 if(scale<.005||screenScale<.015)return null;
 const pads=[0,.2,.4].map(t=>mix(world[3],world[4],t));const zones={};
 fingers.forEach((finger,index)=>{for(const [part,segments] of [['distal',[2]],['lower',[0,1]]])zones[`${finger}:${part}`]=Math.min(...pads.flatMap(pad=>segments.map(segment=>distance(pad,closest(pad,world[5+index*4+segment],world[6+index*4+segment]))/scale)));});
 const worldGap=Math.min(...pads.map(pad=>distance(pad,closest(pad,world[7],world[8]))/scale));
 const screenGap=Math.min(...[0,.2,.4].map(t=>distance(mix(image[3],image[4],t),closest(mix(image[3],image[4],t),image[7],image[8]))/screenScale));
 const pinch=worldGap<.6&&screenGap<.2?Math.min(worldGap,.29+screenGap*.2):worldGap;
 const extensions=[1,5,9,13,17].map(base=>distance(world[base],world[base+3])/Math.max(.001,[0,1,2].reduce((s,j)=>s+distance(world[base+j],world[base+j+1]),0)));
 extensions[0]=Math.min(extensions[0],distance(world[4],world[5])/scale/.65);
 return {zones,pinch,extensions,cursor:mix(mix(image[3],image[4],.2),mix(image[7],image[8],.2),.5),palm:[0,1].map(axis=>[0,5,9,13,17].reduce((s,i)=>s+image[i][axis],0)/5),span:screenScale};
}
export function note(mode,hand,key){let midi;
 if(mode==='finger_count')midi=36+Number(key)+(hand==='Right'?32:0);
 else if(mode==='baseline'){const [finger,part]=key.split(':');midi=60+scaleNotes[fingers.indexOf(finger)+(hand==='Right'?4:0)]-(part==='lower'?12:0);}
 else midi=(hand==='Left'?48:60)+(mode==='conductor'?[0,2,4,7,9]:scaleNotes)[Number(key)];
 return {midi,name:['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi%12]+(Math.floor(midi/12)-1),frequency:440*2**((midi-69)/12),zone:key};
}
class Gate{
 constructor(){this.active=null;this.armed=false;this.candidate=null;this.release=null;this.uncertain=null;}
 update(t,key,distance,ambiguous){const events=[];
  if(distance>.425){this.uncertain=null;this.candidate=null;this.release??=t;if(t-this.release>=.045){if(this.active!==null)events.push(['off',this.active]);this.active=null;this.armed=true;}return events;}
  this.release=null;
  if(ambiguous||distance>.34){this.candidate=null;this.uncertain??=t;if(t-this.uncertain>.18&&this.active!==null){events.push(['off',this.active]);this.active=null;this.armed=false;}return events;}
  this.uncertain=null;if(!this.armed||this.active===key){this.candidate=null;return events;}
  if(this.candidate!==key){this.candidate=key;this.since=t;}
  else if(t-this.since>=(this.active!==null?.055:.018)){if(this.active!==null)events.push(['off',this.active]);this.active=key;this.candidate=null;events.push(['on',key]);}return events;
 }
}
export class Hand{
 constructor(){this.reset();}
 reset(){this.gate=new Gate();this.last=-1;this.seen=-1;this.previous=null;this.cursor=[.5,.5];this.cursorReady=false;this.lane=null;this.bits=null;this.candidate=null;this.active=null;this.armed=false;this.low=null;this.top=null;this.strike=-1;this.until=0;this.hint='Show hand';this.progress=0;this.line=null;}
 update(mode,observation,t){
  if(t<=this.last)return [];const dt=t-this.last,gap=this.last>=0&&dt>.2;this.last=t;const data=observation?.control;
  if(gap||!data||observation.confidence<.55){this.candidate=null;this.gate.candidate=null;this.gate.release=null;this.previous=null;this.armed=false;this.low=this.top=null;if(gap||t-this.seen>.1){this.reset();this.last=t;return [['off',null]];}this.hint='Tracking briefly obscured';return [];}
  this.seen=t;const target=mode==='air_keys'?data.cursor:data.palm;this.cursor=!this.cursorReady||mode==='conductor'?[...target]:mix(target,this.cursor,dt/(.02+dt));this.cursorReady=true;
  const lanes=mode==='conductor'?5:8, proposed=clip(Math.floor(this.cursor[0]*lanes),0,lanes-1);
  if(this.lane===null||this.cursor[0]<this.lane/lanes-.012||this.cursor[0]>(this.lane+1)/lanes+.012)this.lane=proposed;
  if(mode==='finger_count'){
   this.bits??=data.extensions.map(v=>v>=.79);data.extensions.forEach((v,i)=>{if(v>=.85)this.bits[i]=true;else if(v<=.72)this.bits[i]=false;});
   const key=String(this.bits.reduce((s,v,i)=>s+(v?1<<i:0),0));this.hint='Hold shape · '+this.bits.map(v=>v?'●':'○').join('');
   if(key===this.active){this.candidate=null;return [];}if(key!==this.candidate){this.candidate=key;this.since=t;return [];}if(t-this.since<.085)return [];
   const events=this.active!==null?[['off',this.active]]:[];this.active=key;this.candidate=null;return [...events,['on',key]];
  }
  if(mode==='conductor'){
   const vertical=this.cursor[1],travel=clip(data.span*.3,.018,.07);
   if(!this.previous){this.low=this.top=vertical;this.previous=[t,vertical];this.hint='Lift palm to prepare';return [];}
   const velocity=(vertical-this.previous[1])/(t-this.previous[0]);this.previous=[t,vertical];
   if(!this.armed){this.low=Math.max(this.low,vertical);this.progress=clip((this.low-vertical)/travel,0,1);this.line=this.low-travel;this.hint='Lift to READY';if(this.progress>=1){this.armed=true;this.top=vertical;}}
   if(this.armed){this.top=Math.min(this.top,vertical);this.line=this.top+travel;this.progress=clip((vertical-this.top)/travel,0,1);this.hint='READY · down to strike';if(this.progress>=1&&velocity>.08&&t-this.strike>.16){this.armed=false;this.low=vertical;this.strike=t;this.until=t+.55;this.hint='PLAYING · lift again';return [['on',String(this.lane)]];}}
   if(t<this.until)this.hint='PLAYING · lift again';return [];
  }
  let distance,key,ambiguous=false;
  if(mode==='baseline'){const ranked=Object.entries(data.zones).sort((a,b)=>a[1]-b[1]);[key,distance]=ranked[0];if(this.gate.active!==null&&data.zones[this.gate.active]-distance<.045){key=this.gate.active;distance=data.zones[key];}else ambiguous=ranked[1][1]-distance<.015;this.progress=clip(1-distance/.5,0,1);}
  else{distance=data.pinch;key=this.gate.active??String(this.lane);this.progress=clip((.5-distance)/.18,0,1);}
  const events=this.gate.update(t,key,distance,ambiguous);this.active=this.gate.active;this.hint=this.active!==null?'PLAYING · open to release':this.gate.armed?'Touch to play':'Open thumb to prepare';return events;
 }
}
