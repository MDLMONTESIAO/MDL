@echo off
cd /d "%~dp0"
git status
git add acervo data
git commit -m "Atualiza acervo de cifras"
git push origin main
pause
