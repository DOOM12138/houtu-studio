param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination,[switch]$Overlay)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$project=Split-Path -Parent $PSScriptRoot
$allowed=[IO.Path]::GetFullPath((Join-Path $project '.cache\local-agent'))+'\'
$target=[IO.Path]::GetFullPath($Destination)
if (!$target.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Local agent extraction must remain in project cache' }
function Assert-NoRuntimeLinks([string]$value) {
 $absolute=[IO.Path]::GetFullPath($value)
 if (!$absolute.StartsWith([IO.Path]::GetFullPath($project)+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime path escapes project' }
 $cursor=$absolute
 while ($cursor -and $cursor.Length -ge $project.Length) {
  try { $attributes=[IO.File]::GetAttributes($cursor); if ($attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Runtime path cannot traverse a reparse point' } } catch [IO.FileNotFoundException] {} catch [IO.DirectoryNotFoundException] {}
  if ($cursor -eq $project) { break }
  $cursor=[IO.Path]::GetDirectoryName($cursor.TrimEnd('\'))
 }
}
Assert-NoRuntimeLinks $target
New-Item -ItemType Directory -Path $target -Force | Out-Null
Assert-NoRuntimeLinks $target
$zip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Archive))
try {
 $names=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);$total=[long]0
 if ($zip.Entries.Count -gt 15000) { throw 'Too many runtime files' }
 foreach ($entry in $zip.Entries) {
  $name=$entry.FullName.Replace('\','/');$total+=$entry.Length
  if ($total -gt 20GB -or $name.StartsWith('/') -or $name.Contains(':') -or $name.Split('/') -contains '..' -or $name.Split('/') -contains '.' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Unsafe runtime archive' }
  foreach ($part in $name.Split('/')) { if ($part -and ($part.EndsWith(' ') -or $part.EndsWith('.') -or $part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)')) { throw 'Unsafe Windows archive name' } }
  $file=[IO.Path]::GetFullPath((Join-Path $target $name))
  if (!$file.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime archive escapes destination' }
  if (!$names.Add($file.TrimEnd('\'))) { throw 'Duplicate runtime path' }
  Assert-NoRuntimeLinks $file
 }
 foreach ($entry in $zip.Entries) {
  $file=[IO.Path]::GetFullPath((Join-Path $target $entry.FullName))
  Assert-NoRuntimeLinks $file
  if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $file -Force | Out-Null; continue }
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($file)) -Force | Out-Null
  Assert-NoRuntimeLinks $file
  if ((Test-Path -LiteralPath $file) -and !$Overlay) { throw 'Runtime destination already exists' }
  if ((Test-Path -LiteralPath $file) -and ((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Runtime target cannot be a link' }
  $stream=$entry.Open();$output=[IO.File]::Open($file,[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $stream.CopyTo($output) } finally { $output.Dispose();$stream.Dispose() }
 }
} finally { $zip.Dispose() }
