@echo off
title HRM Hydraulic - desktop icon
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create_desktop_icon.ps1"
echo.
echo  Desktop icon created. You can close this window.
pause
