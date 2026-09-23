"""Native performance controller: four independent instruments and a four-part game."""
import time
from native_session import NativeSession
from universal_input import UniversalHand, MODES, sound
from music import midi_note


class PerformanceSession(NativeSession):
    def __init__(self,audio):
        super().__init__(audio)
        self.universal=True
        self.controls={hand:UniversalHand() for hand in ('Left','Right')}
        self.selection='baseline';self.mode='baseline';self.stage=0;self.unique=set()
        self.points=0;self.played=0;self.hits={};self.finished=False

    def reset(self):
        super().reset()
        for control in getattr(self,'controls',{}).values():control.reset()
        self.hits={}

    def choose(self,selection):
        if selection not in (*MODES,'journey'):raise ValueError('Unknown instrument')
        with self.lock:
            self.selection=selection;self.stage=0;self.mode='baseline' if selection=='journey' else selection
            self.unique=set();self.points=0;self.played=0;self.finished=False;self.reset()

    def advance(self):
        with self.lock:
            if self.selection!='journey' or len(self.unique)<self.target:return
            if self.stage==3:self.finished=True;self.reset();return
            self.stage+=1;self.mode=tuple(MODES)[self.stage];self.unique=set();self.reset()

    @property
    def target(self):return 5 if self.mode=='conductor' else 6

    def ingest(self,payload):
        with self.lock:
            started=time.monotonic();self.latest=payload;self.audio.last_frame=started
            if self.paused or self.finished or payload.get('error') or started-payload['time']>.25:
                self.reset();return
            observations={entry['hand']:entry for entry in payload['hands']}
            for hand,control in self.controls.items():
                observation=observations.get(hand)
                for kind,key in control.update(self.mode,observation,payload['time']):
                    if kind=='off':self.audio.off(hand)
                    else:
                        note=midi_note(sound(self.mode,hand,key),hand,str(key))
                        self.audio.on(hand,note,observation.get('expression',.65),duration=.55 if self.mode=='conductor' else None)
                        self.played+=1
                        distinct=(hand,key) not in self.unique
                        if self.selection!='journey':self.points+=10
                        elif distinct and len(self.unique)<self.target:self.points+=100
                        self.unique.add((hand,key))
                        self.hits[hand]={'note':note['name'],'key':key,'time':started,'cursor':list(control.cursor)}
                if observation:self.audio.expression(hand,observation.get('expression',.65))
            self.recognition_ms=(time.monotonic()-started)*1000

    def snapshot(self):
        with self.lock:
            now=time.monotonic();fresh=now-self.latest.get('time',0)<.3
            if not fresh:self.reset()
            return {**self.latest,'hands':self.latest.get('hands',[]) if fresh else [],
                    'live':bool(self.tracker and fresh and not self.latest.get('error')),
                    'status':self.tracker.status if self.tracker else 'Camera off',
                    'backend':self.tracker.backend if self.tracker else '',
                    'mode':self.mode,'selection':self.selection,'paused':self.paused,
                    'controls':{hand:control.snapshot(now) for hand,control in self.controls.items()},
                    'hits':dict(self.hits),'points':self.points,'played':self.played,
                    'stage':self.stage,'distinct':min(self.target,len(self.unique)),'target':self.target,'finished':self.finished,
                    'recognition_ms':self.recognition_ms}
