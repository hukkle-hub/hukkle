@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0payload"
where py >nul 2>nul
if %errorlevel%==0 (
  start "흥양기 v37" http://127.0.0.1:8777
  py -3 -m http.server 8777 --bind 127.0.0.1
) else (
  start "흥양기 v37" http://127.0.0.1:8777
  python -m http.server 8777 --bind 127.0.0.1
)
