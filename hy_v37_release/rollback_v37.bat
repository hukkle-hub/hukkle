@echo off
chcp 65001 >nul
setlocal
set "REPO=%~1"
if "%REPO%"=="" (
  echo v37을 설치했던 hukkle 저장소 폴더 경로를 입력하세요.
  set /p "REPO=> "
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0apply_v37_patch.py" --rollback "%REPO%"
) else (
  python "%~dp0apply_v37_patch.py" --rollback "%REPO%"
)
if errorlevel 1 (
  echo.
  echo 복구에 실패했습니다. 위 오류를 확인하세요.
  pause
  exit /b 1
)
echo.
echo v37 설치 전 상태로 복구했습니다.
pause
