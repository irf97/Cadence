"""Performance-first Windows UI. No personal calibration or profile settings."""
import json
import time
from pathlib import Path
import numpy as np
from PySide6.QtCore import Qt,QTimer,QRectF,QPointF
from PySide6.QtGui import QColor,QFont,QImage,QPainter,QPen
from PySide6.QtWidgets import QMainWindow,QWidget,QVBoxLayout,QHBoxLayout,QGridLayout,QLabel,QPushButton,QComboBox,QSlider,QFrame
from native_audio import NativeAudio
from performance_session import PerformanceSession
from universal_input import MODES,GUIDES,sound
from music import midi_note
from instrument import FINGERS

ROOT=Path(__file__).parent
CYAN='#74e1dc';PINK='#ff709b';LILAC='#b9a1ff'


def label(text):
    widget=QLabel(text);widget.setWordWrap(True);return widget


class PerformanceCanvas(QWidget):
    def __init__(self):
        super().__init__();self.setMinimumSize(600,320);self.frame=None;self.state={}
        self.setAccessibleName('Live instrument with note targets and gesture progress')

    def paintEvent(self,event):
        painter=QPainter(self);painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.fillRect(self.rect(),QColor('#171b2a'));area=QRectF(self.rect())
        if self.frame is not None:
            height,width,_=self.frame.shape;scale=min(self.width()/width,self.height()/height)
            area=QRectF((self.width()-width*scale)/2,(self.height()-height*scale)/2,width*scale,height*scale)
            painter.drawImage(area,QImage(self.frame.data,width,height,self.frame.strides[0],QImage.Format.Format_BGR888))
        def position(point):return QPointF(area.x()+point[0]*area.width(),area.y()+point[1]*area.height())
        mode=self.state.get('mode','baseline');controls=self.state.get('controls',{})
        lanes=5 if mode=='conductor' else 8
        if mode in ('conductor','air_keys'):
            for lane in range(lanes):
                rect=QRectF(area.x()+lane*area.width()/lanes,area.y(),area.width()/lanes,area.height())
                color=QColor((CYAN,LILAC,PINK)[lane%3]);color.setAlpha(28);painter.fillRect(rect,color)
                painter.setPen(QPen(QColor('#68708c'),1));painter.drawLine(rect.topLeft(),rect.bottomLeft())
                painter.setPen(QColor('white'));painter.setFont(QFont('Segoe UI',11,QFont.Weight.Bold))
                pitch=midi_note(sound(mode,'Left',str(lane)))['name']
                upper=midi_note(sound(mode,'Right',str(lane)))['name']
                painter.drawText(QRectF(rect.x(),area.bottom()-32,rect.width(),28),Qt.AlignmentFlag.AlignCenter,f'{pitch} / {upper}')
        now=time.monotonic()
        for hand in self.state.get('hands',[]) if not self.state.get('paused') else []:
            side=hand['hand'];control=controls.get(side,{});color=QColor(CYAN if side=='Left' else PINK)
            points=hand['points'];painter.setPen(QPen(color,2))
            for base in (1,5,9,13,17):
                painter.drawLine(position(points[0]),position(points[base]))
                for offset in range(3):painter.drawLine(position(points[base+offset]),position(points[base+offset+1]))
            if mode=='baseline':
                for index,finger in enumerate(FINGERS):
                    for segment in range(3):
                        part='distal' if segment==2 else 'lower';active=control.get('active')==f'{finger}:{part}'
                        pen=QPen(QColor('white' if active else CYAN if part=='distal' else LILAC),11 if active else 7)
                        pen.setCapStyle(Qt.PenCapStyle.RoundCap);painter.setPen(pen)
                        painter.drawLine(position(points[5+index*4+segment]),position(points[6+index*4+segment]))
            if mode=='finger_count':
                for index,extended in enumerate(control.get('bits') or [False]*5):
                    painter.setBrush(color if extended else QColor('#282c40'));painter.setPen(QPen(QColor('white'),2))
                    painter.drawEllipse(position(points[4+index*4]),8,8)
                painter.setBrush(Qt.BrushStyle.NoBrush)
            cursor=position(control.get('cursor',[.5,.5]));sounding=control.get('sounding',False)
            painter.setPen(QPen(QColor('white') if sounding else color,5 if sounding else 3))
            painter.drawEllipse(cursor,20 if sounding else 13,20 if sounding else 13)
            if mode=='conductor' and control.get('line') is not None:
                line_y=position([0,control['line']]).y()
                painter.setPen(QPen(color,3,Qt.PenStyle.DashLine))
                painter.drawLine(QPointF(max(area.left(),cursor.x()-65),line_y),QPointF(min(area.right(),cursor.x()+65),line_y))
            if mode in ('conductor','air_keys') and control.get('lane') is not None:
                chosen=int(control['active']) if control.get('active') is not None else control['lane']
                rect=QRectF(area.x()+chosen*area.width()/lanes,area.y()+36,area.width()/lanes,area.height()-36)
                painter.setPen(QPen(color,4 if sounding else 2));painter.drawRect(rect)
                if sounding:
                    tint=QColor(color);tint.setAlpha(60);painter.fillRect(rect,tint)
            painter.setFont(QFont('Segoe UI',10,QFont.Weight.Bold));painter.setPen(color)
            text_x=max(area.left()+4,min(area.right()-180,cursor.x()-80))
            text_y=max(area.top()+65,min(area.bottom()-65,cursor.y()+34))
            painter.drawText(QPointF(text_x,text_y),control.get('hint',''))
            if mode!='finger_count':
                painter.fillRect(QRectF(text_x,text_y+8,100,6),QColor('#35394c'))
                painter.fillRect(QRectF(text_x,text_y+8,100*control.get('progress',0),6),color)
            hit=self.state.get('hits',{}).get(side)
            if hit and now-hit['time']<.6:
                pulse=position(hit['cursor']);age=(now-hit['time'])/.6
                pulse_color=QColor(color);pulse_color.setAlphaF(max(0,1-age));painter.setPen(QPen(pulse_color,4))
                painter.drawEllipse(pulse,24+age*45,24+age*45)
                painter.setFont(QFont('Segoe UI',22,QFont.Weight.Bold));painter.drawText(pulse+QPointF(24,-20),hit['note'])
        painter.fillRect(QRectF(0,0,self.width(),36),QColor(16,18,28,220))
        painter.setPen(QColor(CYAN));painter.setFont(QFont('Segoe UI',11))
        status='PAUSED' if self.state.get('paused') else 'LIVE' if self.state.get('live') else self.state.get('status','Opening camera…')
        painter.drawText(12,24,status)
        painter.setPen(QColor(PINK));painter.drawText(QRectF(self.width()-250,5,235,28),Qt.AlignmentFlag.AlignRight,f'{self.state.get("points",0)} points · {self.state.get("played",0)} notes')
        painter.end()


class PerformanceWindow(QMainWindow):
    def __init__(self):
        super().__init__();self.audio=NativeAudio();self.session=PerformanceSession(self.audio)
        self.setWindowTitle('Cadence Vol. 2 — Windows instrument');self.resize(1180,880)
        self.audit_time=0;self.guide_mode=None
        root=QWidget();layout=QVBoxLayout(root);layout.setContentsMargins(20,14,20,14);layout.setSpacing(10)
        header=QHBoxLayout();title=label('cadence  /  PLAY');title.setStyleSheet('font-size:28px;font-weight:700;color:#b9a1ff');header.addWidget(title);header.addStretch()
        self.mode=QComboBox()
        for key,name in MODES.items():self.mode.addItem(name,key)
        self.mode.addItem('Orchestra journey · all four','journey');self.mode.currentIndexChanged.connect(self.change_mode);header.addWidget(self.mode)
        test=QPushButton('Test sound');test.clicked.connect(self.audition);header.addWidget(test);layout.addLayout(header)
        self.instruction=label(GUIDES['baseline']);self.instruction.setMinimumHeight(36);layout.addWidget(self.instruction)
        self.journey=QFrame();self.journey.setObjectName('panel');journey_layout=QHBoxLayout(self.journey)
        self.challenge=label('');journey_layout.addWidget(self.challenge,1)
        self.next=QPushButton('Next movement');self.next.clicked.connect(self.session.advance);journey_layout.addWidget(self.next)
        self.restart=QPushButton('Restart journey');self.restart.clicked.connect(lambda:self.session.choose('journey'));journey_layout.addWidget(self.restart);layout.addWidget(self.journey)
        self.canvas=PerformanceCanvas();layout.addWidget(self.canvas,1)
        statuses=QHBoxLayout();self.cards={}
        for hand,color in (('Left',CYAN),('Right',PINK)):
            card=label(hand+' · show hand');card.setMinimumHeight(52);card.setStyleSheet(f'background:#202537;color:{color};border-radius:10px;padding:8px;font-size:14px');statuses.addWidget(card,1);self.cards[hand]=card
        layout.addLayout(statuses)
        self.guide=QFrame();self.guide.setObjectName('panel');self.guide_grid=QGridLayout(self.guide);layout.addWidget(self.guide)
        transport=QHBoxLayout();self.pause_button=QPushButton('Pause');self.pause_button.clicked.connect(self.session.pause);transport.addWidget(self.pause_button)
        stop=QPushButton('Stop camera');stop.clicked.connect(self.stop);transport.addWidget(stop)
        retry=QPushButton('Start / retry camera');retry.clicked.connect(self.start);transport.addWidget(retry)
        self.palette=QComboBox()
        for name,value in [('Piano + strings','ensemble'),('Piano','piano'),('Strings','strings')]:self.palette.addItem(name,value)
        self.palette.currentIndexChanged.connect(self.change_palette);transport.addWidget(self.palette)
        transport.addWidget(label('Volume'));volume=QSlider(Qt.Orientation.Horizontal);volume.setRange(0,80);volume.setValue(45);volume.setMaximumWidth(140);volume.valueChanged.connect(lambda value:setattr(self.audio,'volume',value/100));transport.addWidget(volume)
        details=QPushButton('Details');details.setCheckable(True);details.toggled.connect(lambda checked:self.details.setVisible(checked));transport.addWidget(details);layout.addLayout(transport)
        self.details=QWidget();details_layout=QHBoxLayout(self.details);self.camera=QComboBox()
        for index in range(3):self.camera.addItem(f'Camera {index+1}',index)
        details_layout.addWidget(self.camera);self.metrics=label('');details_layout.addWidget(self.metrics,1);self.details.hide();layout.addWidget(self.details)
        self.error=label('');self.error.setStyleSheet('color:#ff709b');layout.addWidget(self.error)
        self.setCentralWidget(root);self.timer=QTimer(self);self.timer.timeout.connect(self.refresh);self.timer.start(33)
        self.refresh();QTimer.singleShot(250,self.start)

    def change_mode(self):self.session.choose(self.mode.currentData());self.refresh()

    def change_palette(self):self.audio.palette=self.palette.currentData();self.session.reset()

    def start(self):
        try:self.session.stop();self.session.start(self.camera.currentData())
        except Exception as exc:self.session.latest['error']=str(exc)

    def stop(self):
        try:self.session.stop()
        except Exception as exc:self.session.latest['error']=str(exc)

    def audition(self,note=None):
        try:self.audio.start();self.audio.on('audition',note if isinstance(note,dict) else midi_note(60),duration=.7)
        except Exception as exc:self.session.latest['error']=str(exc)

    def build_guide(self,mode):
        while self.guide_grid.count():
            item=self.guide_grid.takeAt(0)
            widget=item.widget()
            if widget:widget.hide();widget.setParent(None);widget.deleteLater()
        if mode=='baseline':
            for hand_index,hand in enumerate(('Left','Right')):
                for finger_index,finger in enumerate(FINGERS):
                    for part_index,part in enumerate(('distal','lower')):
                        note=midi_note(sound(mode,hand,f'{finger}:{part}'))
                        button=QPushButton(f'{hand[0]} {finger} · {"tip" if part=="distal" else "lower"}\n{note["name"]}')
                        button.setStyleSheet('color:'+(CYAN if part_index==0 else LILAC));button.clicked.connect(lambda checked=False,note=note:self.audition(note))
                        self.guide_grid.addWidget(button,part_index,hand_index*4+finger_index)
        elif mode=='finger_count':
            self.guide_grid.addWidget(label('32 shapes per hand · thumb / index / middle / ring / little. Filled dots = extended. A fist is also a note.\nLeft: C2–G4 · Right: G♯4–D♯7. Both hands together produce 1,024 possible two-note combinations.'),0,0)
        else:
            for lane in range(5 if mode=='conductor' else 8):
                self.guide_grid.addWidget(label(f'{midi_note(sound(mode,"Left",str(lane)))["name"]} / {midi_note(sound(mode,"Right",str(lane)))["name"]}'),0,lane)
        self.guide_mode=mode

    def refresh(self):
        state=self.session.snapshot();mode=state['mode'];self.canvas.state=state;self.canvas.frame=self.session.image;self.canvas.update()
        self.instruction.setText(GUIDES[mode]);self.pause_button.setText('Resume' if state['paused'] else 'Pause')
        journey=state['selection']=='journey';self.journey.setVisible(journey)
        self.challenge.setText('Composition complete · all four instruments explored!' if state['finished'] else f'Movement {state["stage"]+1}/4 · {MODES[mode]} · Play {state["target"]} different inputs: {state["distinct"]}/{state["target"]}')
        self.next.setEnabled(state['distinct']>=state['target'] and not state['finished']);self.next.setText('Finish composition' if state['stage']==3 else 'Next movement')
        if mode!=self.guide_mode:self.build_guide(mode)
        for hand,card in self.cards.items():
            control=state['controls'][hand];hit=state['hits'].get(hand)
            title=(hit['note']+' · PLAYING') if hit and control['sounding'] else 'Ready' if state['live'] else 'Camera off'
            if mode=='finger_count' and control['bits'] is not None:title+=' · '+''.join('●' if bit else '○' for bit in control['bits'])
            card.setText(f'{hand.upper()} · '+('Paused' if state['paused'] else title)+'\n'+control['hint'])
        self.error.setText(state.get('error',''));self.error.setVisible(bool(state.get('error')))
        self.metrics.setText(f'{state.get("fps",0):.1f} fps · {state.get("processing_ms",0):.0f} ms frame · {self.audio.latency_ms:.0f} ms audio estimate · {self.audio.underruns} underruns\nLocal processing. No recordings. Timings are components, not total gesture latency.')
        if time.monotonic()-self.audit_time>1:
            self.audit_time=time.monotonic()
            evidence={'live':state['live'],'status':state['status'],'backend':state['backend'],'fps':state.get('fps',0),'processing_ms':state.get('processing_ms',0),'preview':self.session.image is not None,'audio_active':bool(self.audio.stream and self.audio.stream.active),'audio_latency_ms':self.audio.latency_ms,'underruns':self.audio.underruns,'error':state.get('error',''),'recognition_mode':mode,'interface':'universal','selection':state['selection']}
            try:(ROOT/'artifacts'/'native-status.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
            except OSError:pass

    def closeEvent(self,event):
        self.timer.stop()
        try:self.session.stop()
        finally:self.audio.close()
        event.accept()
