import test from 'node:test';
import assert from 'node:assert/strict';
import {readMidi} from '../docs/midi.js';
const chunk=(tag,data)=>{const header=Buffer.alloc(8);header.write(tag);header.writeUInt32BE(data.length,4);return Buffer.concat([header,Buffer.from(data)]);};
function midi(tracks,format=tracks.length>1?1:0){const header=Buffer.from([0,format,0,tracks.length,1,224]);return Uint8Array.from(Buffer.concat([chunk('MThd',header),...tracks.map(t=>chunk('MTrk',t))])).buffer;}
test('MIDI groups chords, honors running status and ignores note-off and channel 10',()=>{
 const track=[0,0xff,3,4,76,101,97,100,0,0x90,60,100,0,64,100,120,60,0,0,64,0,0,0x99,38,110,0,0x90,62,100,0,0xff,0x2f,0];
 const parsed=readMidi(midi([track]));assert.equal(parsed[0].name,'Lead');assert.deepEqual(parsed[0].groups,[[60,64],[62]]);
});
test('format 1 keeps melody tracks selectable and ignores an empty tempo track',()=>{
 const tempo=[0,0xff,0x51,3,7,0xa1,0x20,0,0xff,0x2f,0],left=[0,0x90,48,100,0,0xff,0x2f,0],right=[0,0x91,72,100,0,0xff,0x2f,0];
 const parsed=readMidi(midi([tempo,left,right]));assert.equal(parsed.length,2);assert.deepEqual(parsed.map(t=>t.groups),[[[48]],[[72]]]);
});
test('malformed and unsupported files fail with bounded, readable errors',()=>{
 assert.throws(()=>readMidi(new ArrayBuffer(2)),/truncated/);
 assert.throws(()=>readMidi(Uint8Array.from([77,80,51,0]).buffer),/standard/);
 assert.throws(()=>readMidi(midi([[0,60,100]])),/running status/);
 assert.throws(()=>readMidi(midi([[0,0x90,60]])),/truncated/);
 assert.throws(()=>readMidi(midi([[0,0xff,3,10,65]])),/truncated/);
 assert.throws(()=>readMidi(midi([[0,0x90,60,100]],2)),/format/);
 assert.throws(()=>readMidi(midi([[0,0xff,0x2f,0]])),/No pitched notes/);
 assert.throws(()=>readMidi(midi([[255,255,255,255,0,0x90,60,100]])),/timing/);
});
