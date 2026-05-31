@echo off
setlocal

cd /d "%~dp0"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "TS=%%I"
set "LOG_DIR=%~dp0logs"
set "LOG_PATH=%LOG_DIR%\enviar-cifras-%TS%.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

if exist "%~dp0.git\index.lock" (
  tasklist /FI "IMAGENAME eq git.exe" 2>NUL | find /I "git.exe" >NUL
  if errorlevel 1 (
    echo Lock antigo do Git encontrado. Removendo .git\index.lock...
    del /F /Q "%~dp0.git\index.lock"
  ) else (
    echo.
    echo ERRO: existe um processo git.exe rodando e o arquivo .git\index.lock esta presente.
    echo Feche qualquer terminal, Git ou editor que esteja usando este projeto e tente novamente.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo ============================================================
echo  Enviar cifras para GitHub e Render
echo ============================================================
echo.
echo Pasta: %CD%
echo Log:   %LOG_PATH%
echo.
echo O processo vai:
echo  1. Preparar thumbs dos artistas
echo  2. Reimportar o acervo
echo  3. Criar commit das cifras, thumbs e JSONs
echo  4. Atualizar com o GitHub
echo  5. Enviar para origin/main
echo  6. Disparar Render se config-local.env estiver configurado
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "& { node 'scripts\auto-atualizar-github.js' 2>&1 | Tee-Object -FilePath $env:LOG_PATH; exit $LASTEXITCODE }"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo ============================================================
  echo  Concluido com sucesso.
  echo ============================================================
) else (
  echo ============================================================
  echo  Falhou com codigo %EXIT_CODE%.
  echo  Veja o log acima ou abra:
  echo  %LOG_PATH%
  echo ============================================================
)
echo.
pause
exit /b %EXIT_CODE%
