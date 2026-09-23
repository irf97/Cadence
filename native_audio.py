"""Preloaded piano + continuous strings through a low-latency PortAudio stream."""
from dataclasses import dataclass
from pathlib import Path
import time
import numpy as np



@dataclass
class Voice:
    midi: int
    palette: str
    expression: float = .65
    position: int = 0
    release: int | None = None
    ends: float = float('inf')


class NativeAudio:
    def __init__(self):
        self.rate = 48000
        self.volume = .45
        self.palette = 'ensemble'
        self.targets = {h: None for h in ('Left', 'Right', 'audition')}
        self.playing = dict(self.targets)
        self.tails = []
        self.piano, self.strings = {}, {}
        self.stream = None
        self.peak = self.level = 0.
        self.underruns = 0
        self.last_frame = time.monotonic()
        self.device_name = ''
        self.latency_ms = 0
        self.ramp = np.arange(32768, dtype=np.float32)

    def load(self):
        import soundfile as sf
        anchors = {}
        for octave in (2, 3, 4, 5):
            data, rate = sf.read(Path(__file__).parent/'docs'/'samples'/f'C{octave}.mp3', dtype='float32', always_2d=True)
            anchors[12*(octave+1)] = (data.mean(axis=1), rate)
        midis = range(36,100)
        t = np.arange(self.rate*4, dtype=np.float32)/self.rate
        for midi in midis:
            anchor = min(anchors, key=lambda a: abs(a-midi))
            data, rate = anchors[anchor]
            positions = np.arange(0, len(data)-1, rate/self.rate*2**((midi-anchor)/12))
            self.piano[midi] = np.interp(positions, np.arange(len(data)), data).astype(np.float32)
            frequency = round(440*2**((midi-69)/12)*4)/4  # seam-free four-second cycle
            self.strings[midi] = (.10*np.sin(2*np.pi*frequency*t)+.027*np.sin(4*np.pi*frequency*t)+.012*np.sin(6*np.pi*frequency*t)).astype(np.float32)

    def start(self):
        import sounddevice as sd
        if self.stream is not None:
            return
        apis = sd.query_hostapis()
        wasapi = next((a for a in apis if a['name']=='Windows WASAPI' and a['default_output_device']>=0), None)
        device = wasapi['default_output_device'] if wasapi else sd.default.device[1]
        info = sd.query_devices(device)
        self.rate = int(info['default_samplerate'])
        self.load()
        stream = sd.OutputStream(device=device, samplerate=self.rate, channels=min(2,info['max_output_channels']),
                                 dtype='float32', latency='low', blocksize=0, callback=self.callback)
        try:
            stream.start()
        except Exception:
            stream.close()
            raise
        self.stream = stream
        self.device_name = info['name']+' · '+apis[info['hostapi']]['name']
        self.latency_ms = round(stream.latency*1000, 1)

    def on(self, hand, n, expression=.65, duration=None):
        if n['midi'] not in self.piano:
            return
        self.targets[hand] = Voice(n['midi'], self.palette, expression, ends=time.monotonic()+duration if duration else float('inf'))

    def off(self, hand):
        self.targets[hand] = None

    def quiet(self, include_audition=True):
        for hand in self.targets:
            if hand != 'audition' or include_audition:
                self.targets[hand] = None

    def expression(self, hand, value):
        voice = self.targets.get(hand)
        if voice:
            voice.expression = value

    def callback(self, out, frames, timing, status):
        out.fill(0)
        if status:
            self.underruns += 1
        if frames > len(self.ramp):
            self.underruns += 1
            return
        now = time.monotonic()
        for key in self.targets:
            desired = self.targets[key]
            if desired and (now > desired.ends or (key != 'audition' and now-self.last_frame > .3)):
                desired.ends = 0  # a recovered frame must not resurrect an expired voice
                desired = None
            old = self.playing[key]
            if old is not desired:
                if old:
                    old.release = 0
                    self.tails.append(old)
                self.playing[key] = desired
        self.tails = self.tails[-6:]
        voices = [v for v in self.playing.values() if v is not None]+self.tails
        r = self.ramp[:frames]
        for voice in voices:
            pos = voice.position
            signal = np.zeros(frames, dtype=np.float32)
            if voice.palette != 'strings':
                piano = self.piano[voice.midi]
                count = max(0, min(frames, len(piano)-pos))
                signal[:count] += piano[pos:pos+count]*1.8
            if voice.palette != 'piano':
                pad = self.strings[voice.midi]
                at = pos % len(pad)
                count = min(frames, len(pad)-at)
                signal[:count] += pad[at:at+count]
                if count<frames:
                    signal[count:] += pad[:frames-count]
            envelope = np.minimum((r+pos)/(self.rate*.008),1)
            if voice.release is not None:
                envelope *= np.maximum(0,1-(r+voice.release)/(self.rate*.08))
                voice.release += frames
            signal *= envelope*(.4+.45*voice.expression)*self.volume
            out[:,0] += signal
            voice.position += frames
        self.tails = [v for v in self.tails if v.release < self.rate*.08]
        np.clip(out[:,0],-.95,.95,out=out[:,0])
        if out.shape[1]>1:
            out[:,1] = out[:,0]
        self.level = float(np.max(np.abs(out[:,0])))
        self.peak = max(self.peak,self.level)

    def close(self):
        self.quiet()
        if self.stream is not None:
            self.stream.stop()
            self.stream.close()
            self.stream = None
