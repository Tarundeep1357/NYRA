$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Starting Nyra at http://localhost:8765'
Write-Host 'Keep this terminal open. Press Ctrl+C to stop.'
python server.py
