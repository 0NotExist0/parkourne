@echo off
rem Avvia il gioco in locale per testarlo. Su Vercel il gioco e' statico: non serve server.
cd /d "%~dp0"
start "" index.html
pause
