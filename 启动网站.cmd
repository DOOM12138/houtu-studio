@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "TEMP=%~dp0tmp"
set "TMP=%~dp0tmp"
set "TMPDIR=%~dp0tmp"
set "npm_config_cache=%~dp0.cache\npm"
if not exist "%TEMP%" mkdir "%TEMP%"
if exist "%~dp0runtime\HoutuStudio.exe" (
  start "" /D "%~dp0" "%~dp0runtime\HoutuStudio.exe"
  exit /b
)
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0launcher.mjs"
  if errorlevel 1 pause
  exit /b
)
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or later: https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\@openai\codex\bin\codex.js" (
  call npm install
  if errorlevel 1 (
    echo Installation failed. Check your network and try again.
    pause
    exit /b 1
  )
)
node launcher.mjs
if errorlevel 1 pause
