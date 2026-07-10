cd "$PSScriptRoot"
Write-Host "Starting Cache server..." -ForegroundColor Green
node server.js
if ($LASTEXITCODE -ne 0) {
  Write-Host "Node.js failed with code $LASTEXITCODE" -ForegroundColor Red
  Write-Host "Install Node.js from https://nodejs.org or run: winget install OpenJS.NodeJS" -ForegroundColor Yellow
}
Read-Host "Press Enter to exit"
