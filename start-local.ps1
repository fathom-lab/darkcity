# start-local.ps1 — boot DarkCity against the local portable Postgres.
# Reads secrets from the gitignored .env.*.local files; nothing sensitive lives here.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Import-EnvFile($path) {
  if (-not (Test-Path $path)) { return }
  foreach ($line in Get-Content $path) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -lt 1) { continue }
    $k = $t.Substring(0, $i).Trim()
    $v = $t.Substring($i + 1).Trim().Trim("'", '"')
    Set-Item -Path "env:$k" -Value $v
  }
}

Import-EnvFile "$root\.env.darkcoin-db.local"
Import-EnvFile "$root\.env.styxx-treasury.local"   # legacy filename; env fallbacks handle the old names

if (-not $env:JWT_SECRET) {
  # Stable across restarts so sessions survive; generated once, then reused.
  $jwtFile = "$root\.env.jwt.local"
  if (-not (Test-Path $jwtFile)) {
    $gen = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
    Set-Content -Path $jwtFile -Value "JWT_SECRET=$gen" -Encoding ascii -NoNewline
  }
  Import-EnvFile $jwtFile
}

if (-not $env:PORT) { $env:PORT = '3777' }
if (-not $env:NODE_ENV) { $env:NODE_ENV = 'development' }   # local PG has no SSL
if (-not $env:DARKCITY_REGISTRATION_OPEN) { $env:DARKCITY_REGISTRATION_OPEN = 'true' }

Write-Host "[darkcity] port=$($env:PORT)  db=$([regex]::Replace($env:DATABASE_URL,':[^:@]+@',':***@'))"
Set-Location $root
node server.js
