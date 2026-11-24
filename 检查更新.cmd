@echo off
setlocal DisableDelayedExpansion
pushd "%~dp0"
if exist "runtime\node.exe" ("runtime\node.exe" "launcher.mjs" --updates) else (node "launcher.mjs" --updates)
popd
