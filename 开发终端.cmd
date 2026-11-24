@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "TEMP=%~dp0tmp"
set "TMP=%~dp0tmp"
set "TMPDIR=%~dp0tmp"
set "npm_config_cache=%~dp0.cache\npm"
set "PLAYWRIGHT_BROWSERS_PATH=%~dp0.cache\browsers"
if not exist "%TEMP%" mkdir "%TEMP%"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoExit
