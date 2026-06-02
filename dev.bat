@echo off
cd /d "%~dp0"
echo Starting VANDOR dev server...
call npm.cmd run dev
pause
