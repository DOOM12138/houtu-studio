@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0launcher.mjs" --stop --no-open
) else (
  node "%~dp0launcher.mjs" --stop --no-open
)
if errorlevel 1 pause
