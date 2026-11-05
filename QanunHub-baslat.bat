@echo off
chcp 65001 >nul
title QanunHub
cd /d "%~dp0release"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js tapilmadi. https://nodejs.org saytindan LTS versiyasini qurun, sonra bu fayli yeniden acin.
  start "" https://nodejs.org/
  pause
  exit /b 1
)
node server.mjs
pause
