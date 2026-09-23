"""Capture lifecycle shared by the native performance controller."""
import threading
from vision import Tracker


class NativeSession:
    def __init__(self,audio):
        self.audio=audio;self.lock=threading.RLock();self.tracker=None;self.image=None
        self.latest={'hands':[],'fps':0,'processing_ms':0,'error':''}
        self.paused=False;self.generation=0;self.recognition_ms=0.

    def reset(self):
        with self.lock:self.audio.quiet(False)

    def start(self,index=0):
        if self.tracker is not None:raise RuntimeError('Stop the current camera first.')
        self.audio.start();self.generation+=1;generation=self.generation
        self.latest={'hands':[],'fps':0,'processing_ms':0,'error':''};self.image=None;self.paused=False;self.reset()
        def preview(frame):
            if generation==self.generation:self.image=frame
        def result(payload,jpeg):
            with self.lock:
                if generation==self.generation and payload:self.ingest(payload)
        self.tracker=Tracker(index,result,raw_preview=preview,universal=True);self.tracker.start()

    def stop(self):
        with self.lock:
            self.generation+=1;tracker=self.tracker;self.reset()
        if tracker and not tracker.stop():raise RuntimeError('Camera is still closing. Retry Stop.')
        self.tracker=None;self.image=None;self.latest={'hands':[],'fps':0,'processing_ms':0,'error':''}

    def pause(self):
        with self.lock:self.paused=not self.paused;self.reset()
