export const solfege = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do↑'];
export const scale = [60, 62, 64, 65, 67, 69, 71, 72];
export const drumNames = ['Hi-hat', 'Snare', 'Tom', 'Kick'];
const chords = [[60,64,67,71],[62,65,69,72],[64,67,71,74],[65,69,72,76],
  [67,71,74,77],[69,72,76,79],[71,74,77,81],[72,76,79,83]];
const chordNames = ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bø7', 'Cmaj7↑'];
export const ode = {
  name: 'Ode to Joy · Beethoven',
  groups: [64,64,65,67,67,65,64,62,60,60,62,64,64,62,62,
    64,64,65,67,67,65,64,62,60,60,62,64,62,60,60].map(midi => [midi])
};
export const noteValue = midi => ({midi, frequency: 440 * 2 ** ((midi - 69) / 12),
  name: ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi % 12] + (Math.floor(midi / 12) - 1)});

export class BodyMusic {
  constructor() { this.preset = 'drums'; this.song = ode; this.position = 0; this.loop = true; }
  reset() { this.position = 0; }
  setSong(song) { this.song = song; this.reset(); }
  play(event) {
    const index = Math.max(0, Math.min(7, event.index));
    if (this.preset === 'drums') return {label: drumNames[event.zone], drum: ['hat','snare','tom','kick'][event.zone],
      expression: event.expression, notes: []};
    let notes, label;
    if (this.preset === 'song') {
      if (!this.song.groups.length || (!this.loop && this.position >= this.song.groups.length)) return null;
      notes = this.song.groups[this.position % this.song.groups.length];
      this.position++; label = notes.map(midi => noteValue(midi).name).join(' + ');
    } else if (this.preset === 'jazz') { notes = [chords[index][0] - 24, ...chords[index]]; label = chordNames[index]; }
    else { notes = [scale[index]]; label = solfege[index]; }
    return {notes: notes.map(noteValue), label, expression: event.expression,
      palette: this.preset === 'classical' ? 'ensemble' : 'piano', duration: this.preset === 'classical' ? .65 : .4};
  }
}
