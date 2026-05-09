@echo off
cd /d "%~dp0"
git status
git add .gitignore README.md atualizar-acervo.bat iniciar.bat package.json package-lock.json render.yaml server.js docs modos-visualizacao-musicas public scripts
git diff --cached --quiet
if not errorlevel 1 (
  echo Nenhuma alteracao do sistema foi encontrada para enviar.
  pause
  exit /b 0
)
git commit -m "Atualiza sistema"
if errorlevel 1 (
  echo Falha ao criar o commit da atualizacao do sistema.
  pause
  exit /b 1
)
git push origin main
pause
