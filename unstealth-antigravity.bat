@echo off
REM 1-Click Normal Mode Restorer for Antigravity IDE
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0unstealth-antigravity.ps1"
pause
