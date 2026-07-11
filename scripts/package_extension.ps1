# Build a browser-downloadable zip of the extension (manifest at zip root).
# Usage: pwsh scripts/package_extension.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ext = Join-Path $root "extension"
$manifest = Get-Content (Join-Path $ext "manifest.json") -Raw | ConvertFrom-Json
$ver = $manifest.version
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Path $dist -Force | Out-Null

$named = Join-Path $dist "flow-fixer-extension-v$ver.zip"
$latest = Join-Path $dist "flow-fixer-extension.zip"
foreach ($z in @($named, $latest)) {
  if (Test-Path $z) { Remove-Item $z -Force }
}

# ZIP entry names always use forward slashes. Building entries explicitly avoids
# Windows PowerShell versions that preserve backslashes in archived paths.
Add-Type -AssemblyName System.IO.Compression
$stream = [System.IO.File]::Open($named, [System.IO.FileMode]::CreateNew)
try {
  $archive = [System.IO.Compression.ZipArchive]::new(
    $stream,
    [System.IO.Compression.ZipArchiveMode]::Create,
    $false
  )
  try {
    Get-ChildItem -Path $ext -File -Recurse | ForEach-Object {
      $relative = $_.FullName.Substring($ext.Length).TrimStart('\', '/')
      $entryName = $relative.Replace('\', '/')
      $entry = $archive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
      $entryStream = $entry.Open()
      try {
        $sourceStream = $_.OpenRead()
        try { $sourceStream.CopyTo($entryStream) }
        finally { $sourceStream.Dispose() }
      }
      finally { $entryStream.Dispose() }
    }
  }
  finally { $archive.Dispose() }
}
finally { $stream.Dispose() }

# Fail the build if any archive implementation or future edit emits an invalid
# cross-platform path or nests the manifest below the archive root.
$readStream = [System.IO.File]::OpenRead($named)
try {
  $archive = [System.IO.Compression.ZipArchive]::new(
    $readStream,
    [System.IO.Compression.ZipArchiveMode]::Read,
    $false
  )
  try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
    if ($entryNames -match '\\') { throw "ZIP contains Windows-style path separators" }
    if ($entryNames -notcontains "manifest.json") { throw "ZIP is missing manifest.json at its root" }
  }
  finally { $archive.Dispose() }
}
finally { $readStream.Dispose() }

Copy-Item $named $latest -Force

Write-Host "Wrote $named"
Write-Host "Wrote $latest (stable name for release URL)"
Get-Item $named, $latest | Format-Table Name, Length
