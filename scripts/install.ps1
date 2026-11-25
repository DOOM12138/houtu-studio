param([string]$Destination = '', [switch]$NoShortcut, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$sourceRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$installRoot = if ([string]::IsNullOrWhiteSpace($Destination)) { $sourceRoot } else { [IO.Path]::GetFullPath($Destination) }
if ($installRoot -eq [IO.Path]::GetPathRoot($installRoot)) { throw 'Cannot deploy to a drive root.' }
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'runtime/node.exe'))) { throw 'Please use the complete Windows x64 portable package.' }
if ($installRoot -ne $sourceRoot) {
  $oldLauncher = Join-Path $installRoot 'launcher.mjs'
  $oldNode = Join-Path $installRoot 'runtime/node.exe'
  if ((Test-Path -LiteralPath $oldLauncher) -and (Test-Path -LiteralPath $oldNode)) {
    & $oldNode $oldLauncher --stop --no-open
    if ($LASTEXITCODE -ne 0) { throw 'Please stop the existing website before updating.' }
  }
  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
  $items = @('server.mjs','launcher.mjs','lib','public','frontend','backend','models','scripts','vendor-licenses','runtime','node_modules','package.json','package-lock.json','README.md','DEPLOY.md','SOURCES.md','AGENTS.md','agent.md','ARCHITECTURE.md','GIT_WORKFLOW.md', 'FEATURES.md', 'FEATURE_PARITY.md', 'PROMPT_LAB.md','CHANGELOG.md','LICENSE','.npmrc','开发终端.cmd','THIRD-PARTY-NOTICES.txt','portable-manifest.json','启动网站.cmd','停止网站.cmd','一键部署.cmd','启动服务器.cmd','服务器管理.cmd','停止服务器.cmd','检查更新.cmd','回退版本.cmd')
  if (Test-Path -LiteralPath (Join-Path $sourceRoot 'defaults')) { $items += 'defaults' }
  foreach ($item in $items) { Copy-Item -LiteralPath (Join-Path $sourceRoot $item) -Destination $installRoot -Recurse -Force -ErrorAction Stop }
}
if (-not $NoShortcut) {
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('Desktop')
  $shortcut = $shell.CreateShortcut((Join-Path $desktop '厚涂小站.lnk'))
  $shortcut.TargetPath = if (Test-Path -LiteralPath (Join-Path $installRoot 'runtime/HoutuStudio.exe')) { Join-Path $installRoot 'runtime/HoutuStudio.exe' } else { Join-Path $installRoot '启动网站.cmd' }
  $shortcut.WorkingDirectory = $installRoot
  $shortcut.Description = '人物精修与二次元厚涂'
  $shortcut.Save()
}
Write-Output ('Deployed to: ' + $installRoot)
if (-not $NoLaunch) { if (Test-Path -LiteralPath (Join-Path $installRoot 'runtime/HoutuStudio.exe')) { Start-Process -FilePath (Join-Path $installRoot 'runtime/HoutuStudio.exe') -WorkingDirectory $installRoot -WindowStyle Hidden } else { & (Join-Path $installRoot 'runtime/node.exe') (Join-Path $installRoot 'launcher.mjs') } }
