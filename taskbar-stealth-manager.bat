@echo off
REM 1-Click GUI Taskbar & Alt+Tab Stealth Manager
cd /d "%~dp0"
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0taskbar-stealth-manager.ps1"
