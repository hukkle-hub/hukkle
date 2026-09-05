@echo off
chcp 65001 >nul
set "TARGET=%~1"
if "%TARGET%"=="" (
  echo hukkle 저장소 폴더를 이 BAT 파일 위로 끌어다 놓으세요.
  pause
  exit /b 1
)
py -3 "%~dp0tools\apply_to_repo.py" "%TARGET%"
if errorlevel 1 python "%~dp0tools\apply_to_repo.py" "%TARGET%"
pause
