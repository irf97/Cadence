STYLE='\n        QWidget {background:#10121c;color:#f5f3ff;font-family:Segoe UI;font-size:12px}\n        QScrollArea {border:0} QFrame#panel {background:#1b1e2b;border:1px solid #303446;border-radius:12px}\n        QFrame#panel QLabel {background:transparent}\n        QPushButton,QComboBox {background:#292d40;border:1px solid #3b4057;border-radius:7px;padding:7px}\n        QPushButton:hover {background:#41455d} QPushButton:disabled {color:#747990}\n        QPushButton#primary {background:#ff709b;color:#261324;font-weight:700}\n        QPushButton[segment="0"] {color:#74e1dc;background:#263d43;padding:3px}\n        QPushButton[segment="1"] {color:#b9a1ff;background:#34344c;padding:3px}\n        QPushButton[segment="2"] {color:#ffb4d3;background:#433043;padding:3px}\n        QPushButton[lit="true"] {background:#796eaa;border:2px solid white}\n        QSlider::groove:horizontal {background:#35394c;height:5px;border-radius:2px}\n        QSlider::handle:horizontal {background:#b9a1ff;width:15px;margin:-5px 0;border-radius:7px}\n        QComboBox QAbstractItemView {background:#292d40;selection-background-color:#555071}\n    '
import multiprocessing
import sys
from pathlib import Path
from PySide6.QtWidgets import QApplication, QMessageBox
from PySide6.QtCore import QLockFile,QStandardPaths
from performance_ui import PerformanceWindow

def main():
    app=QApplication(sys.argv)
    lock=QLockFile(QStandardPaths.writableLocation(QStandardPaths.StandardLocation.TempLocation)+'/cadence-vol2-native.lock')
    if not lock.tryLock(100):
        QMessageBox.information(None,'Already open','Use the existing Cadence window.');return 0
    app.setStyle('Fusion')
    app.setStyleSheet(STYLE)
    window=PerformanceWindow();window.show();result=app.exec();lock.unlock();return result

if __name__=='__main__':
    multiprocessing.freeze_support()
    root=Path(__file__).parent/'artifacts';root.mkdir(exist_ok=True)
    if sys.stdout is None:sys.stdout=open(root/'app.log','a',encoding='utf-8')
    if sys.stderr is None:sys.stderr=open(root/'errors.log','a',encoding='utf-8')
    raise SystemExit(main())
