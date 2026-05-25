@echo off
title LinkedIn Job Scraper
cd /d "%~dp0"

echo.
echo  Starting LinkedIn Job Scraper...
echo  Opening http://localhost:3000
echo  Close this window to stop the server.
echo.

:: Open browser after a short delay so the server is ready
start "" timeout /t 2 /nobreak >nul & start "" "http://localhost:3000"

node dist\server.js
