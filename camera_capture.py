"""Bounded Windows camera opening, with an isolated owner for blocked drivers.

Only the latest 640x480 BGR frame crosses shared memory. No JPEG or frame queue.
"""
import multiprocessing as mp
import os
import time
import numpy as np

WIDTH, HEIGHT = 640, 480


def capture_worker(index, backend, pixels, serial, captured, lock, status):
    import cv2
    cap = None
    try:
        cap = cv2.VideoCapture(index, backend)
        if not cap.isOpened():
            status.send(('error', 'Camera could not be opened'))
            return
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, HEIGHT)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        buffer = np.frombuffer(pixels, dtype=np.uint8).reshape(HEIGHT, WIDTH, 3)
        while True:
            ok, frame = cap.read()
            if not ok:
                status.send(('error', 'Camera stopped delivering frames'))
                return
            timestamp = time.monotonic()
            if frame.shape != buffer.shape:
                frame = cv2.resize(frame, (WIDTH, HEIGHT))
            with lock:
                buffer[:] = frame
                captured.value = timestamp
                serial.value += 1
    except Exception as exc:
        status.send(('error', str(exc)))
    finally:
        if cap is not None:
            cap.release()
        status.close()


class CameraSource:
    def __init__(self, index, stop_event, progress=lambda message: None):
        self.index, self.stop_event, self.progress = index, stop_event, progress
        self.process = self.pipe = None
        self.backend = ''
        self.previous = 0

    def close(self):
        if self.process is not None:
            if self.process.is_alive():
                self.process.terminate()
            self.process.join(1)
            if self.process.is_alive():
                self.process.kill()
                self.process.join(1)
            self.process.close()
            self.process = None
        if self.pipe is not None:
            self.pipe.close()
            self.pipe = None

    def open(self, timeout=7):
        import cv2
        ctx = mp.get_context('spawn')
        options = [('DirectShow', cv2.CAP_DSHOW), ('Media Foundation', cv2.CAP_MSMF)] if os.name == 'nt' else [('Default', cv2.CAP_ANY)]
        errors = []
        for name, backend in options:
            if self.stop_event.is_set():
                return None
            self.backend = name
            self.progress(f'Opening camera {self.index+1} · {name}…')
            self.pixels = ctx.RawArray('B', WIDTH*HEIGHT*3)
            self.serial, self.captured = ctx.RawValue('q', 0), ctx.RawValue('d', 0)
            self.lock = ctx.Lock()
            self.pipe, sending = ctx.Pipe(duplex=False)
            self.process = ctx.Process(target=capture_worker, args=(self.index, backend, self.pixels, self.serial, self.captured, self.lock, sending), daemon=True)
            self.process.start()
            sending.close()
            self.previous = 0
            deadline = time.monotonic()+timeout
            try:
                while time.monotonic() < deadline and not self.stop_event.is_set():
                    item = self.read()
                    if item is not None:
                        self.progress(f'Camera live · {name}')
                        return item
                    self.stop_event.wait(.005)
                errors.append(f'{name}: no frame within {timeout}s')
            except RuntimeError as exc:
                errors.append(f'{name}: {exc}')
            self.close()
        if self.stop_event.is_set():
            return None
        raise RuntimeError('Camera unavailable. Close other camera apps (including Vol. 1), check the privacy shutter and Windows camera access for desktop apps, then Retry camera. '+ '; '.join(errors))

    def read(self):
        if self.pipe and self.pipe.poll():
            try:
                kind, message = self.pipe.recv()
            except EOFError:
                raise RuntimeError('Camera driver exited') from None
            if kind == 'error':
                raise RuntimeError(message)
        if self.serial.value == self.previous:
            if not self.process.is_alive():
                raise RuntimeError('Camera driver exited')
            return None
        # A dead driver must not leave the main process waiting on its lock.
        if not self.lock.acquire(timeout=.02):
            return None
        try:
            self.previous = self.serial.value
            frame = np.frombuffer(self.pixels, dtype=np.uint8).reshape(HEIGHT, WIDTH, 3).copy()
            return self.previous, self.captured.value, frame
        finally:
            self.lock.release()
