@echo off
chcp 65001 > nul
cd /d "%~dp0"
node src/bot/index.js
pause
