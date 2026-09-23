@echo off
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe py -3.11 -m venv .venv
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe -m pip install -r requirements-app.txt
if errorlevel 1 exit /b 1
echo Ready. Open Start Windows App.cmd.
pause
