@echo off
chcp 65001 >nul
cd /d "%~dp0"
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
