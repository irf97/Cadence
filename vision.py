from math import dist
import threading
import time
import numpy as np
from universal_input import measurements

class AdaptiveFilter:
    def __init__(self):
        self.p = None
        self.t = 0.

    def update(self, points, t):
        raw = np.asarray(points)
        if self.p is None or t-self.t > .18:
            self.p = raw
        else:
            dt = max(.001, t-self.t)
            speed = float(np.linalg.norm(raw-self.p, axis=1).mean()/dt)
            tau = .025/(1+8*speed)
            self.p += dt/(tau+dt)*(raw-self.p)
        self.t = t
        return self.p.tolist()


class Tracker:
    def __init__(self, index, callback, raw_preview=None, universal=False):
        self.index, self.callback = index, callback
        self.raw_preview = raw_preview
        self.universal = universal
        self.status = 'Preparing camera…'
        self.backend = ''
        self.stop_event = threading.Event()
        self.changed = threading.Condition()
        self.frame = None
        self.error = ''
        self.capture = threading.Thread(target=self._capture, daemon=True, name='capture-latest')
        self.inference = threading.Thread(target=self._infer, daemon=True, name='infer-latest')

    def start(self):
        self.capture.start()
        self.inference.start()

    def stop(self):
        self.stop_event.set()
        with self.changed:
            self.changed.notify_all()
        self.capture.join(4)
        self.inference.join(4)
        return not (self.capture.is_alive() or self.inference.is_alive())

    def _capture(self):
        from camera_capture import CameraSource
        def progress(message):
            self.status = message
        source = CameraSource(self.index, self.stop_event, progress)
        try:
            item = source.open()
            self.backend = source.backend
            last_frame = time.monotonic()
            while not self.stop_event.is_set():
                if item is not None:
                    last_frame = time.monotonic()
                    with self.changed:
                        self.frame = item
                        self.changed.notify()
                elif time.monotonic()-last_frame > 3:
                    raise RuntimeError('Camera stopped delivering frames. Retry camera.')
                self.stop_event.wait(.003)
                item = source.read()
        except Exception as exc:
            self.error = str(exc)
            self.callback({'error': self.error, 'hands': [], 'time': time.monotonic()}, None)
            self.stop_event.set()
            with self.changed:
                self.changed.notify_all()
        finally:
            source.close()

    def _infer(self):
        import cv2
        import mediapipe as mp
        filters = {h: AdaptiveFilter() for h in ('Left', 'Right')}
        previous = {}
        last_centres = {}
        last_id = 0
        last_t = None
        fps = 0.
        try:
            with mp.solutions.hands.Hands(max_num_hands=2, model_complexity=1,
                                         min_detection_confidence=.5, min_tracking_confidence=.5) as detector:
                while not self.stop_event.is_set():
                    with self.changed:
                        self.changed.wait_for(lambda: self.stop_event.is_set() or (self.frame and self.frame[0] != last_id), .2)
                        if self.stop_event.is_set():
                            return
                        item = self.frame
                    if not item or item[0] == last_id:
                        continue
                    last_id, captured, bgr = item
                    started = time.monotonic()
                    result = detector.process(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
                    inferred = time.monotonic()
                    observations = []
                    raw_hands = list(zip(result.multi_hand_landmarks or [], result.multi_hand_world_landmarks or [], result.multi_handedness or []))
                    # When the classifier becomes uncertain at the side, preserve
                    # recent spatial identity. Never assign a hand twice.
                    used = set()
                    for landmarks, world, handedness in sorted(raw_hands, key=lambda x: -x[2].classification[0].score):
                        label = handedness.classification[0]
                        side = 'Left' if label.label == 'Right' else 'Right'
                        screen = [(v.x, v.y, v.z) for v in landmarks.landmark]
                        wrist = screen[0][:2]
                        near = [(dist(wrist, centre), h) for h, (centre, t) in last_centres.items()
                                if h not in used and captured-t < .2]
                        if near:
                            d, old_side = min(near)
                            if d < .12 and (label.score < .85 or side in used):
                                side = old_side
                        if side in used:
                            continue
                        used.add(side)
                        last_centres[side] = (wrist, captured)
                        world_points = filters[side].update([(v.x, v.y, v.z) for v in world.landmark], captured)
                        personal = {}
                        control = measurements(world_points, [[1-v[0],v[1]] for v in screen]) if self.universal else None
                        zone, distance, ambiguous = None,1.,True
                        previous[side] = zone if distance < .30 else None
                        observations.append(dict(hand=side, zone=zone, distance=round(distance, 4), ambiguous=ambiguous,
                                                 **personal, control=control, handedness_score=float(label.score),
                                                 points=[[round(1-v[0], 4), round(v[1], 4)] for v in screen],
                                                 expression=round(max(.25, min(1., 1-screen[0][1])), 3)))
                    if last_t:
                        instantaneous = 1/max(.001, inferred-last_t)
                        fps = instantaneous if not fps else .9*fps+.1*instantaneous
                    last_t = inferred
                    payload = dict(frame=last_id, time=captured, hands=observations, fps=round(fps, 1),
                                   inference_ms=round((inferred-started)*1000, 1),
                                   processing_ms=round((inferred-captured)*1000, 1), error='')
                    # Send controls before encoding the preview; sound never waits for JPEG.
                    self.callback(payload, None)
                    if self.raw_preview is not None:
                        self.raw_preview(cv2.flip(bgr, 1))
                    else:
                        ok, jpeg = cv2.imencode('.jpg', cv2.flip(bgr, 1), [cv2.IMWRITE_JPEG_QUALITY, 75])
                        if ok:
                            self.callback(None, jpeg.tobytes())
        except Exception as exc:
            self.error = str(exc)
            self.callback({'error': self.error, 'hands': [], 'time': time.monotonic()}, None)
            self.stop_event.set()
