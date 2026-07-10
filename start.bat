@echo off
title Cache Server
cd /d "%~dp0"
echo Starting Cache server from %CD%
echo If this fails, try running PowerShell as admin and running:
echo   node "%CD%\server.js"
echo.
node server.js
if %errorlevel% neq 0 (
  echo.
  echo Server exited with code %errorlevel%
  echo Node.js may not be installed. Run: winget install OpenJS.NodeJS
  pause
)
