@echo off
cd /d "%~dp0"
set /p ARTISTA=Digite ou cole o slug/nome do artista no BananaCifras: 
.venv-robo\Scripts\python.exe scripts\baixar-bananacifras.py "%ARTISTA%"
pause
