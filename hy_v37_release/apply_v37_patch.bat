@echo off
chcp 65001 >nul
setlocal
set "REPO=%~1"
if "%REPO%"=="" (
  echo 기존 hukkle 저장소 폴더 경로를 입력하세요.
  set /p "REPO=> "
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0apply_v37_patch.py" "%REPO%"
) else (
  python "%~dp0apply_v37_patch.py" "%REPO%"
)
if errorlevel 1 (
  echo.
  echo 설치에 실패했습니다. 위 오류를 확인하세요.
  pause
  exit /b 1
)
echo.
echo 설치 완료. 저장소의 index.html을 열거나 웹서버를 실행하세요.
pause
