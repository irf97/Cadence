"""Calibration-free controls. Geometry stays dimensionless; time is in seconds."""
import math
import numpy as np
from instrument import ContactGate, FINGERS, SCALE

MODES={'baseline':'Phalanges · 2 zones','finger_count':'Finger combinations','conductor':'Conductor','air_keys':'Air keys'}
GUIDES={
    'baseline':'Open your thumb, then touch a finger: cyan tip = high note; lilac lower two segments = low note. Hold to sustain.',
    'finger_count':'Hold any finger shape to play. Each thumb/finger combination has its own note. Both hands combine. Hide a hand or pause to silence.',
    'conductor':'Choose a wide lane with your palm. Lift until READY, then move down through the strike line. The meter shows how close you are.',
    'air_keys':'The circle between thumb and index chooses the note. Open, then pinch the finger pads. Hold to sustain; open to stop.',
}


def closest(point,start,end):
    direction=end-start
    amount=np.clip(np.dot(point-start,direction)/max(1e-12,np.dot(direction,direction)),0,1)
    return start+amount*direction


def measurements(world,screen):
    points=np.asarray(world,dtype=float);image=np.asarray(screen,dtype=float)
    if points.shape!=(21,3) or image.shape!=(21,2) or not np.isfinite(points).all() or not np.isfinite(image).all():return None
    scale=(np.linalg.norm(points[5]-points[17])+np.linalg.norm(points[0]-points[9]))/2
    image_scale=(np.linalg.norm(image[5]-image[17])+np.linalg.norm(image[0]-image[9]))/2
    if scale<.005 or image_scale<.015:return None
    pads=[points[3]*amount+points[4]*(1-amount) for amount in (0,.2,.4)]
    distances={}
    for finger_index,finger in enumerate(FINGERS):
        base=5+4*finger_index
        for part,segments in (('distal',(2,)),('lower',(0,1))):
            distances[f'{finger}:{part}']=min(float(np.linalg.norm(pad-closest(pad,points[base+segment],points[base+segment+1]))/scale) for pad in pads for segment in segments)
    pinch_world=min(float(np.linalg.norm(pad-closest(pad,points[7],points[8]))/scale) for pad in pads)
    screen_pads=[image[3]*amount+image[4]*(1-amount) for amount in (0,.2,.4)]
    pinch_screen=min(float(np.linalg.norm(pad-closest(pad,image[7],image[8]))/image_scale) for pad in screen_pads)
    pinch=pinch_world
    if pinch_world<.6 and pinch_screen<.2:pinch=min(pinch_world,.29+pinch_screen*.2)
    extensions=[]
    for base in (1,5,9,13,17):
        chain=points[base:base+4]
        extensions.append(float(np.linalg.norm(chain[-1]-chain[0])/max(.001,np.linalg.norm(np.diff(chain,axis=0),axis=1).sum())))
    thumb_spread=float(np.linalg.norm(points[4]-points[5])/scale)
    extensions[0]=min(extensions[0],thumb_spread/ .65)
    cursor=(.2*image[3]+.8*image[4]+.2*image[7]+.8*image[8])/2
    palm=np.mean(image[[0,5,9,13,17]],axis=0)
    return {'zones':distances,'pinch':pinch,'extensions':extensions,'cursor':cursor.tolist(),
            'palm':palm.tolist(),'span':float(image_scale),'pinch_world':pinch_world}


def sound(mode,hand,key):
    if mode=='finger_count':return 36+int(key)+(32 if hand=='Right' else 0)
    if mode=='baseline':
        finger,part=key.split(':')
        return 60+SCALE[FINGERS.index(finger)+(4 if hand=='Right' else 0)]-(12 if part=='lower' else 0)
    bank=(0,2,4,7,9) if mode=='conductor' else SCALE
    return (48 if hand=='Left' else 60)+bank[int(key)]


class UniversalHand:
    def __init__(self):self.reset()

    def reset(self):
        self.gate=ContactGate();self.last_time=-1;self.last_seen=-1;self.previous=None
        self.lane=None;self.bits=None;self.candidate=None;self.candidate_since=0.;self.active=None
        self.low=None;self.top=None;self.armed=False;self.last_strike=-1;self.sounding_until=0.
        self.hint='Show hand';self.cursor=[.5,.5];self.progress=0.;self.line=None;self.last_key=None
        self.cursor_ready=False

    def snapshot(self,now):
        return {'hint':self.hint,'cursor':self.cursor,'lane':self.lane,'active':self.active,
                'progress':self.progress,'line':self.line,'armed':self.armed,
                'sounding':self.active is not None or now<self.sounding_until,
                'bits':self.bits,'last_key':self.last_key}

    def update(self,mode,observation,timestamp):
        if timestamp<=self.last_time:return []
        elapsed=timestamp-self.last_time
        gap=self.last_time>=0 and timestamp-self.last_time>.2
        self.last_time=timestamp
        data=observation.get('control') if observation else None
        if gap or not data or observation.get('handedness_score',0)<.55:
            self.candidate=None
            self.gate.candidate=None;self.gate.release_since=None
            self.previous=None;self.low=None;self.top=None;self.armed=False
            if gap or timestamp-self.last_seen>.1:
                self.reset();self.last_time=timestamp;self.hint='Show hand clearly'
                return [('off',None)]
            self.hint='Tracking briefly obscured';return []
        self.last_seen=timestamp
        target=data['cursor'] if mode=='air_keys' else data['palm']
        if not self.cursor_ready or mode=='conductor':self.cursor=list(target)
        else:
            weight=elapsed/(.02+elapsed)
            self.cursor=[weight*value+(1-weight)*previous for value,previous in zip(target,self.cursor)]
        self.cursor_ready=True
        lane_count=5 if mode=='conductor' else 8
        proposed=min(lane_count-1,max(0,int(self.cursor[0]*lane_count)))
        if self.lane is None or self.cursor[0]<self.lane/lane_count-.012 or self.cursor[0]>(self.lane+1)/lane_count+.012:self.lane=proposed
        if mode=='finger_count':
            values=data['extensions']
            if self.bits is None:self.bits=[value>=.79 for value in values]
            for index,value in enumerate(values):
                if value>=.85:self.bits[index]=True
                elif value<=.72:self.bits[index]=False
            key=str(sum(1<<index for index,extended in enumerate(self.bits) if extended))
            self.hint='Hold shape · '+''.join('1' if bit else '0' for bit in self.bits)
            if key==self.active:self.candidate=None;return []
            if key!=self.candidate:self.candidate=key;self.candidate_since=timestamp;return []
            if timestamp-self.candidate_since<.085:return []
            events=[('off',self.active)] if self.active is not None else []
            self.active=key;self.last_key=key;self.candidate=None
            return events+[('on',key)]
        if mode=='conductor':
            vertical=self.cursor[1];span=data['span'];travel=max(.018,min(.07,span*.3))
            if self.previous is None:
                self.low=vertical;self.top=vertical;self.previous=(timestamp,vertical)
                self.hint='Lift palm to prepare';return []
            elapsed=timestamp-self.previous[0];velocity=(vertical-self.previous[1])/elapsed
            self.previous=(timestamp,vertical)
            if not self.armed:
                self.low=max(self.low,vertical)
                self.progress=max(0,min(1,(self.low-vertical)/travel))
                self.line=self.low-travel
                self.hint='Lift to READY'
                if self.progress>=1:self.armed=True;self.top=vertical
            if self.armed:
                self.top=min(self.top,vertical);self.line=self.top+travel
                self.progress=max(0,min(1,(vertical-self.top)/travel));self.hint='READY · down to strike'
                if self.progress>=1 and velocity>.08 and timestamp-self.last_strike>.16:
                    self.armed=False;self.low=vertical;self.last_strike=timestamp;self.sounding_until=timestamp+.55
                    self.last_key=str(self.lane);self.hint='PLAYING · lift for next note';self.progress=1
                    return [('on',str(self.lane))]
            if timestamp<self.sounding_until:self.hint='PLAYING · lift for next note'
            return []
        if mode=='baseline':
            ranked=sorted((distance,zone) for zone,distance in data['zones'].items())
            distance,key=ranked[0]
            if self.gate.active in data['zones'] and data['zones'][self.gate.active]-distance<.045:
                key=self.gate.active;distance=data['zones'][key];ambiguous=False
            else:ambiguous=ranked[1][0]-distance<.015
            self.progress=max(0,min(1,1-distance/.5))
        else:
            distance=data['pinch'];key=self.gate.active if self.gate.active is not None else str(self.lane);ambiguous=False
            self.progress=max(0,min(1,(.5-distance)/.18))
        events=self.gate.update(timestamp,key,distance,ambiguous,threshold=.34)
        self.active=self.gate.active
        self.hint='PLAYING · open to release' if self.active is not None else 'Touch to play' if self.gate.armed else 'Open thumb to prepare'
        if self.active is not None:self.last_key=self.active
        return events
