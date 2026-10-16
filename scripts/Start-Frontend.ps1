$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.12+ before starting.' }
$taskNodeVersion = [version]((node --version).TrimStart('v'))
if ($taskNodeVersion -lt [version]'22.12.0') { throw 'Node.js 22.12+ is required by this package.' }
if (-not (Test-Path 'node_modules')) { npm ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } }
Write-Host 'Starting local draft app. No production deployment.'
npm run dev
