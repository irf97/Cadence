@echo off
cd /d "%~dp0"
if not exist .venv\Scripts\pythonw.exe (
 echo Run Setup Windows App.cmd first.
 pause
 exit /b 1
)
start "" .venv\Scripts\pythonw.exe windows_app.py
