@echo off
title Cache Server
cd /d "%~dp0"
echo.
echo ============================================
echo   Cache Server
echo ============================================
echo.
echo Starting server...
echo.
node server.js
echo.
echo Server stopped.
pause
