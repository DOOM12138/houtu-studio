param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$destinationFull=[IO.Path]::GetFullPath($Destination).TrimEnd([char]92)
if(Test-Path -LiteralPath $destinationFull){throw 'Update extraction directory already exists.'}
$zip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Archive))
try {
 $names=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
 $prefix=(-join [char[]](0x539A,0x6D82,0x5C0F,0x7AD9))+'/'
 $total=[long]0
 if($zip.Entries.Count -gt 30000){throw 'Too many archive entries.'}
 foreach($entry in $zip.Entries){
  $name=$entry.FullName.Replace([char]92,[char]47)
  if(-not $name.StartsWith($prefix)){throw 'Invalid archive root.'}
  $relative=$name.Substring($prefix.Length).TrimEnd('/')
  if(-not $relative){continue}
  foreach($part in $relative.Split('/')){if(-not $part -or $part -eq '.' -or $part -eq '..' -or $part.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0 -or $part -match '[. ]$' -or $part.Split('.')[0] -match '^(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])$'){throw 'Unsafe archive path.'}}
  if(-not $names.Add($relative)){throw 'Duplicate archive path.'}
  if((($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960 -or ($entry.ExternalAttributes -band 1024)){throw 'Archive links are not allowed.'}
  $target=[IO.Path]::GetFullPath((Join-Path $destinationFull $name))
  if(-not $target.StartsWith($destinationFull+[char]92,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive path escapes destination.'}
  $total+=$entry.Length
  if($total -gt 3221225472 -or $entry.Length -gt 1073741824){throw 'Expanded archive too large.'}
 }
 New-Item -ItemType Directory -Path $destinationFull | Out-Null
 foreach($entry in $zip.Entries){
  $name=$entry.FullName.Replace([char]92,[char]47)
  if($name.EndsWith('/')){continue}
  $target=[IO.Path]::GetFullPath((Join-Path $destinationFull $name))
  $parent=[IO.Path]::GetDirectoryName($target)
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$false)
 }
} finally {$zip.Dispose()}
