@echo off
REM Script de dev: inicia o sidecar EyeTheia (mpiiface) no venv isolado
REM Execute antes de "npm run electron:dev" ou deixe o Electron subir automaticamente

set EYETHEIA_ROOT=%USERPROFILE%\OneDrive\Desktop\EyeTheia
set EYETHEIA_PYTHON=%EYETHEIA_ROOT%\eyetheia-env\Scripts\python.exe

echo [sidecar] Iniciando EyeTheia mpiiface na porta 8002...
"%EYETHEIA_PYTHON%" "%EYETHEIA_ROOT%\src\run_server.py" --model_path itracker_mpiiface.tar
