param([Parameter(Mandatory=$true)][string]$Source, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceFull = [IO.Path]::GetFullPath($Source)
$destinationFull = [IO.Path]::GetFullPath($Destination)
if (-not (Test-Path -LiteralPath $sourceFull -PathType Container)) { throw 'Archive source is missing.' }
if ($destinationFull.StartsWith($sourceFull.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive output cannot be inside its source.' }
if (Test-Path -LiteralPath $destinationFull) { throw 'Archive output already exists.' }
[IO.Compression.ZipFile]::CreateFromDirectory($sourceFull, $destinationFull, [IO.Compression.CompressionLevel]::Optimal, $false)
