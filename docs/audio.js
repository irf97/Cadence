export class InstrumentAudio {
  constructor() { this.voices = new Map(); this.buffers = new Map(); this.palette = 'ensemble'; this.volume = .35; }
  async init() {
    if (!this.ctx) {
      this.ctx = new AudioContext({latencyHint: 'interactive'});
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -14; limiter.knee.value = 12; limiter.ratio.value = 6;
      this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 256;
      this.levels = new Float32Array(256);
      this.master.connect(limiter).connect(this.analyser).connect(this.ctx.destination);
      this.loading = Promise.all([2,3,4,5].map(async octave => {
        try {
          const response = await fetch(new URL(`./samples/C${octave}.mp3`,import.meta.url));
          if (!response.ok) throw new Error('Sample missing');
          this.buffers.set(12*(octave+1), await this.ctx.decodeAudioData(await response.arrayBuffer()));
        } catch { /* A playable, labelled synthesis fallback is intentional. */ }
      }));
    }
    await this.ctx.resume(); await this.loading;
    return `${this.ctx.state === 'running' ? 'Sound ready' : 'Click Test sound to resume'} · ${this.buffers.size === 4 ? 'sampled grand piano' : 'synthesis fallback'}`;
  }
  setVolume(value) { this.volume = value; if (this.ctx) this.master.gain.setTargetAtTime(value, this.ctx.currentTime, .02); }
  on(key, note, expression=.6) {
    if (this.ctx?.state !== 'running') return;
    this.off(key);
    const c = this.ctx, t = c.currentTime, bus = c.createGain(), envelope = c.createGain();
    bus.gain.value = .45 + expression*.45;
    envelope.gain.setValueAtTime(0,t); envelope.gain.linearRampToValueAtTime(.6,t+.009);
    envelope.connect(bus).connect(this.master);
    const sources = [];
    if (this.palette !== 'strings' && this.buffers.size) {
      const anchor = [...this.buffers.keys()].sort((a,b)=>Math.abs(a-note.midi)-Math.abs(b-note.midi))[0];
      const sample = c.createBufferSource(); sample.buffer = this.buffers.get(anchor);
      sample.playbackRate.value = 2**((note.midi-anchor)/12);
      sample.connect(envelope); sample.start(t); sources.push(sample);
    }
    if (this.palette !== 'piano' || !this.buffers.size) {
      const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1800;
      const pad = c.createGain(); pad.gain.setValueAtTime(0,t);
      pad.gain.linearRampToValueAtTime(this.palette === 'ensemble' ? .065 : .14,t+.055);
      filter.connect(pad).connect(envelope);
      for (const cents of [-5,5]) {
        const oscillator = c.createOscillator(); oscillator.type = 'triangle';
        oscillator.frequency.value = note.frequency; oscillator.detune.value = cents;
        oscillator.connect(filter); oscillator.start(t); sources.push(oscillator);
      }
    }
    this.voices.set(key,{zone:note.zone,bus,envelope,sources});
  }
  expression(key,value) { const voice=this.voices.get(key); if(voice) voice.bus.gain.setTargetAtTime(.45+value*.45,this.ctx.currentTime,.035); }
  off(key, immediate=false) {
    const voice=this.voices.get(key); if (!voice) return;
    const t=this.ctx.currentTime, duration=immediate ? .012 : .14;
    voice.envelope.gain.cancelAndHoldAtTime(t); voice.envelope.gain.linearRampToValueAtTime(0,t+duration);
    for (const source of voice.sources) { try { source.stop(t+duration+.02); } catch {} }
    setTimeout(()=>{ voice.bus.disconnect(); voice.envelope.disconnect(); },(duration+.1)*1000);
    this.voices.delete(key);
  }
  quiet(includeAudition=true) { for(const key of [...this.voices.keys()]) if(includeAudition || key!=='audition') this.off(key,true); }
  async audition(note) { await this.init(); this.on('audition',note); clearTimeout(this.auditionTimer); this.auditionTimer=setTimeout(()=>this.off('audition'),900); }
  get latency() { return this.ctx ? Math.round(((this.ctx.baseLatency||0)+(this.ctx.outputLatency||0))*1000) : null; }
  get level() { if(!this.analyser)return 0;this.analyser.getFloatTimeDomainData(this.levels);return Math.sqrt(this.levels.reduce((sum,v)=>sum+v*v,0)/this.levels.length); }
}
