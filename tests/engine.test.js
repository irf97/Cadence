import test from 'node:test';
import assert from 'node:assert/strict';
import {Hand,note,measurements} from '../docs/engine.js';
const observation=(mask=0,pinch=1)=>({confidence:1,control:{extensions:Array.from({length:5},(_,i)=>mask&(1<<i)?.95:.4),pinch,cursor:[.2,.5],palm:[.8,.5],span:.15,zones:{'index:distal':pinch,'index:lower':1.5}}});
test('every finger pattern has a distinct note and both hands form 1024 pairs',()=>{
 const notes=new Set(),pairs=new Set();for(let mask=0;mask<32;mask++){for(const hand of ['Left','Right'])notes.add(note('finger_count',hand,String(mask)).midi);for(let right=0;right<32;right++)pairs.add([note('finger_count','Left',String(mask)).midi,note('finger_count','Right',String(right)).midi].join(':'));const control=new Hand();control.update('finger_count',observation(mask),1);assert.deepEqual(control.update('finger_count',observation(mask),1.1),[['on',String(mask)]]);}assert.equal(notes.size,64);assert.equal(pairs.size,1024);
});
test('air keys select contact cursor, require release and lock pitch',()=>{
 const hand=new Hand();assert.deepEqual(hand.update('air_keys',observation(0,.3),.9),[]);hand.update('air_keys',observation(),1);hand.update('air_keys',observation(),1.06);hand.update('air_keys',observation(0,.32),1.09);assert.deepEqual(hand.update('air_keys',observation(0,.32),1.12),[['on','1']]);const moved=observation(0,.32);moved.control.cursor=[.9,.5];assert.deepEqual(hand.update('air_keys',moved,1.16),[]);assert.equal(hand.active,'1');
});
test('dropout holds briefly, then silences; reacquired pinch cannot burst',()=>{
 const hand=new Hand();hand.update('air_keys',observation(),1);hand.update('air_keys',observation(),1.06);hand.update('air_keys',observation(0,.2),1.1);hand.update('air_keys',observation(0,.2),1.13);assert.deepEqual(hand.update('air_keys',null,1.16),[]);assert.deepEqual(hand.update('air_keys',null,1.25),[['off',null]]);hand.update('air_keys',observation(0,.2),1.29);assert.deepEqual(hand.update('air_keys',observation(0,.2),1.33),[]);
});
test('conductor uses the visible line and one stroke per lift',()=>{
 const hand=new Hand(),frame=vertical=>{const value=observation();value.control.palm=[.8,vertical];return value;};hand.update('conductor',frame(.6),1);hand.update('conductor',frame(.54),1.05);assert.equal(hand.armed,true);assert.ok(Math.abs(hand.line-.585)<1e-8);assert.deepEqual(hand.update('conductor',frame(.6),1.15),[['on','4']]);assert.deepEqual(hand.update('conductor',frame(.65),1.2),[]);
});
test('two-zone geometry combines lower segments and rejects empty geometry',()=>{
 assert.equal(measurements(Array(21).fill([0,0,0]),Array(21).fill([0,0])),null);
 for(const segment of [0,1,2]){const world=Array.from({length:21},()=>[0,0,0]);world[0]=[0,-.08,0];for(let finger=0;finger<4;finger++)for(let joint=0;joint<4;joint++)world[5+4*finger+joint]=[(finger-1.5)*.035,joint*.03,0];world[3]=world[4]=[-.0525,(segment+.5)*.03,.006];const screen=world.map(p=>[p[0]*2+.5,p[1]*2+.5]);const control=measurements(world,screen);assert.equal(Object.entries(control.zones).sort((a,b)=>a[1]-b[1])[0][0],segment===2?'index:distal':'index:lower');}
});
