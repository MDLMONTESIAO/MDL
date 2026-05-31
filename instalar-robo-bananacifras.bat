@echo off
cd /d "%~dp0"
if not exist ".venv-robo\Scripts\python.exe" (
  python -m venv .venv-robo
)
.venv-robo\Scripts\python.exe -m pip install -r requirements-robo.txt
pause
