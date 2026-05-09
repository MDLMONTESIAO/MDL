@echo off
cd /d "%~dp0"
git status
git add .gitignore README.md atualizar-acervo.bat iniciar.bat package.json package-lock.json render.yaml server.js docs modos-visualizacao-musicas public scripts
git commit -m "Atualiza sistema"
git push origin main
pause
