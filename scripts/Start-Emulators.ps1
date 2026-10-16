$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.12+.' }
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Install Java JDK 17+ for CLI14; JDK21 is recommended.' }
if (-not (Test-Path 'node_modules')) { npm ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } }
if (-not (Test-Path 'functions/.env.local')) { Copy-Item 'functions/.env.local.example' 'functions/.env.local' }
if (-not (Test-Path 'functions/.secret.local')) { Copy-Item 'functions/.secret.local.example' 'functions/.secret.local' }
Write-Host 'Starting demo-cmg-formwork only. No production connection.'
npm run emulators
