@echo off
REM 1-Click Stealth Cloak for Antigravity IDE
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stealth-antigravity.ps1"
