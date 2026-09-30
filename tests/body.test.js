import test from 'node:test';
import assert from 'node:assert/strict';
import {BodyPercussion, bodyObservation} from '../docs/body-engine.js';
import {BodyMusic, scale} from '../docs/body-music.js';

const pair = (x = .8, y = .5) => ({aspect: 1, arms: {
  Left: {palm: [.4,.5], wrist: [.4,.57], elbow: [.4,.97], length: .4},
  Right: {palm: [x,y], wrist: [x,y+.07], elbow: [x,y+.47], length: .4}
}});
const forearm = (x, along = .58) => ({aspect: 1, arms: {
  Left: {palm: [.25,.3], wrist: [.25,.4], elbow: [.25,.8], length: .4},
  Right: {palm: [x,.4+along*.4], wrist: [x+.06,.4+along*.4], elbow: [.9,.9], length: .4}
}});

test('hand contacts require separation, emit once, then rearm', () => {
  const body = new BodyPercussion();
  assert.deepEqual(body.update(pair(.53), 1), []);
  assert.deepEqual(body.update(pair(.53), 1.04), []);
  body.update(pair(), 1.08); body.update(pair(), 1.12);
  const [hit] = body.update(pair(.53), 1.16);
  assert.equal(hit.kind, 'hands'); assert.equal(hit.hand, 'Right');
  assert.deepEqual(body.update(pair(.52), 1.2), []);
  body.update(pair(), 1.24); body.update(pair(), 1.28);
  assert.equal(body.update(pair(.53), 1.32).length, 1);
});

test('dropout, low visibility and late frames do not produce reacquisition hits', () => {
  for (const dropout of [null, {aspect:1,arms:{}}]) {
    const body = new BodyPercussion(); body.update(pair(), 1); body.update(pair(), 1.04);
    body.update(dropout, 1.08);
    assert.deepEqual(body.update(pair(.53), 1.12), []);
  }
  const body = new BodyPercussion(); body.update(pair(), 1); body.update(pair(), 1.04);
  assert.deepEqual(body.update(pair(.53), 1.4), []);
  assert.deepEqual(body.update(pair(), 1.3), []);
  assert.deepEqual(body.update(pair(.53), 1.44), []);
});

test('all four forearm regions select independent notes without duplicate hand events', () => {
  for (let zone=0; zone<4; zone++) {
    const along = .14 + (zone+.5)*.86/4, body = new BodyPercussion();
    body.update(forearm(.48,along), 1); body.update(forearm(.48,along), 1.04);
    const hits = body.update(forearm(.27,along), 1.08);
    assert.equal(hits.length, 1); assert.equal(hits[0].kind, 'forearm');
    assert.equal(hits[0].target, 'Left'); assert.equal(hits[0].zone, zone); assert.equal(hits[0].index, zone);
    assert.deepEqual(body.update(forearm(.28,along), 1.12), []);
  }
});

test('an upward hand tap is a kick and movement strength is bounded', () => {
  const body = new BodyPercussion();body.update(pair(.4,.9),1);body.update(pair(.4,.9),1.04);
  const [hit] = body.update(pair(.4,.65),1.08);
  assert.equal(hit.direction,'up');assert.equal(hit.zone,3);
  assert.ok(hit.expression>=.3&&hit.expression<=1);
});

test('pose observations mirror the display and reject hidden, tiny and malformed arms', () => {
  const landmarks = Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
  landmarks[13]={x:.2,y:.8,visibility:1};landmarks[15]={x:.2,y:.4,visibility:1};
  landmarks[17]={x:.2,y:.3,visibility:1};landmarks[19]={x:.2,y:.3,visibility:1};
  assert.deepEqual(bodyObservation(landmarks).arms.Left.wrist,[.8,.4]);
  assert.equal(bodyObservation(landmarks).arms.Right,undefined);
  landmarks[13].visibility=.2;assert.equal(bodyObservation(landmarks).arms.Left,undefined);
  assert.equal(bodyObservation([]),null);
});

test('song mode advances only on taps, respects end and rewind, and loops cleanly', () => {
  const music = new BodyMusic();music.preset='song';music.setSong({name:'Test',groups:[[60,64],[62]]});music.loop=false;
  const event={index:7,zone:3,expression:.8};
  assert.equal(music.position,0);assert.deepEqual(music.play(event).notes.map(n=>n.midi),[60,64]);
  assert.deepEqual(music.play(event).notes.map(n=>n.midi),[62]);assert.equal(music.play(event),null);
  music.reset();assert.equal(music.position,0);music.loop=true;
  music.play(event);music.play(event);assert.equal(music.play(event).notes[0].midi,60);
});

test('scale and jazz palettes cover both forearms; jazz includes seventh chords and bass', () => {
  const music=new BodyMusic();
  for(let index=0;index<8;index++){
    const event={index,zone:index%4,expression:.5};music.preset='solfege';
    assert.equal(music.play(event).notes[0].midi,scale[index]);
    music.preset='jazz';const notes=music.play(event).notes.map(n=>n.midi);
    assert.equal(notes.length,5);assert.equal(notes[1]-notes[0],24);
  }
});
