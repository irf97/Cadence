// Standard MIDI formats 0/1; only note-on groups are needed for tap-to-advance.
// User timing replaces the MIDI clock. Channel 10 drums are deliberately excluded.
export function readMidi(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('Choose a MIDI file smaller than 4 MB.');
  let offset = 0, events = 0;
  const need = (count, end = bytes.length) => { if (offset + count > end) throw new Error('This MIDI file is truncated.'); };
  const text = count => { need(count); const s = new TextDecoder().decode(bytes.subarray(offset, offset + count)); offset += count; return s; };
  const u16 = () => { need(2); const value = view.getUint16(offset); offset += 2; return value; };
  const u32 = () => { need(4); const value = view.getUint32(offset); offset += 4; return value; };
  const variable = end => {
    let value = 0;
    for (let i = 0; i < 4; i++) { need(1, end); const b = bytes[offset++]; value = value * 128 + (b & 127); if (!(b & 128)) return value; }
    throw new Error('Invalid MIDI timing value.');
  };
  if (text(4) !== 'MThd') throw new Error('Choose a standard .mid or .midi file (not an audio file).');
  const headerLength = u32();
  if (headerLength < 6) throw new Error('Invalid MIDI header.');
  need(headerLength);
  const headerEnd = offset + headerLength, format = u16(), trackCount = u16(), division = u16();
  if (format > 1 || !trackCount || trackCount > 256 || !division || (format === 0 && trackCount !== 1))
    throw new Error('Use a standard format 0 or format 1 MIDI file.');
  offset = headerEnd;
  const tracks = [];
  for (let track = 0; track < trackCount; track++) {
    if (text(4) !== 'MTrk') throw new Error('Missing MIDI track.');
    const length = u32(); need(length); const end = offset + length;
    let tick = 0, running = 0, name = `Track ${track + 1}`;
    const groups = new Map();
    while (offset < end) {
      if (++events > 200000) throw new Error('This MIDI file has too many events.');
      tick += variable(end); need(1, end);
      let status = bytes[offset];
      if (status >= 128) { offset++; if (status < 240) running = status; }
      else { if (!running) throw new Error('Invalid MIDI running status.'); status = running; }
      if (status === 255) {
        running = 0; need(1, end); const type = bytes[offset++], size = variable(end); need(size, end);
        if (type === 3) name = new TextDecoder().decode(bytes.subarray(offset, offset + Math.min(size, 120))).replace(/[\x00-\x1f]/g, '') || name;
        offset += size; if (type === 47) { offset = end; break; }
      } else if (status === 240 || status === 247) {
        running = 0; const size = variable(end); need(size, end); offset += size;
      } else if (status < 240) {
        const kind = status >> 4, channel = status & 15, size = kind === 12 || kind === 13 ? 1 : 2;
        need(size, end); const pitch = bytes[offset], velocity = bytes[offset + 1];
        if (pitch > 127 || (size === 2 && velocity > 127)) throw new Error('Invalid MIDI note data.');
        offset += size;
        if (kind === 9 && velocity > 0 && channel !== 9) {
          if (!groups.has(tick)) groups.set(tick, new Set());
          groups.get(tick).add(pitch);
        }
      } else throw new Error('Unsupported MIDI system event.');
    }
    if (groups.size) tracks.push({name, groups: [...groups.values()].map(notes => [...notes].sort((a, b) => a - b))});
  }
  if (!tracks.length) throw new Error('No pitched notes found. Choose a melody MIDI track.');
  return tracks;
}
