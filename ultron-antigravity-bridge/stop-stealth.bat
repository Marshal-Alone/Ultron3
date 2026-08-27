@echo off
REM Stops any background Ultron Python bridge processes
taskkill /F /IM pythonw.exe >nul 2>&1
taskkill /F /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq uvicorn*" >nul 2>&1

REM Clean up session file if exists
if exist "%USERPROFILE%\.ultron\session.json" (
    del "%USERPROFILE%\.ultron\session.json" >nul 2>&1
)

echo [SUCCESS] Ultron Project Copilot Bridge stopped and cleaned up.
