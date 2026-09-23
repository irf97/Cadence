from dataclasses import dataclass
FINGERS=("index","middle","ring","little")
SCALE=(0,2,4,5,7,9,11,12)

@dataclass
class ContactGate:
    """Confirm distinct frames; ambiguity is not release; loss never re-arms."""
    active: str | None = None
    candidate: str | None = None
    candidate_since: float = 0
    release_since: float | None = None
    last_time: float = -1
    last_seen: float = -1
    armed: bool = False
    uncertain_since: float | None = None

    def reset(self):
        self.active = self.candidate = self.release_since = None
        self.armed = False
        self.uncertain_since = None
        self.last_time = self.last_seen = -1

    def update(self, t, zone, distance, ambiguous=False, tracked=True, threshold=.23):
        if t <= self.last_time:
            return []
        gap = self.last_time >= 0 and t-self.last_time > .18
        self.last_time = t
        events = []
        if not tracked:
            self.candidate = None
            self.release_since = None
            if t-self.last_seen > .12:
                if self.active:
                    events.append(('off', self.active))
                self.active = None
                self.armed = False
                self.release_since = None
            return events
        self.last_seen = t
        if gap:
            if self.active:
                events.append(('off', self.active))
            self.active = self.candidate = None
            self.armed = False
            self.release_since = self.uncertain_since = None
        if distance > threshold+.085:
            self.uncertain_since = None
            self.candidate = None
            if self.release_since is None:
                self.release_since = t
            if t-self.release_since >= .045:
                if self.active:
                    events.append(('off', self.active))
                self.active = None
                self.armed = True
            return events
        self.release_since = None
        if ambiguous or not zone or distance > threshold:
            self.candidate = None
            if self.uncertain_since is None:
                self.uncertain_since = t
            if t-self.uncertain_since > .18 and self.active:
                events.append(('off', self.active))
                self.active = None
                self.armed = False
            return events
        self.uncertain_since = None
        # Changing segments while contact is held requires a stable new segment.
        if not self.armed or zone == self.active:
            self.candidate = None
            return events
        if zone != self.candidate:
            self.candidate, self.candidate_since = zone, t
        elif t-self.candidate_since >= (.055 if self.active else .018):
            if self.active:
                events.append(('off', self.active))
            self.active = zone
            self.candidate = None
            events.append(('on', zone))
        return events