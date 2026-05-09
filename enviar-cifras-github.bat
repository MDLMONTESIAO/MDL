@echo off
cd /d "%~dp0"
node scripts\importar-acervo.js
if errorlevel 1 (
  echo Falha ao atualizar a base online do acervo.
  pause
  exit /b 1
)
git status
git add acervo data
git commit -m "Atualiza acervo de cifras"
git push origin main
pause
