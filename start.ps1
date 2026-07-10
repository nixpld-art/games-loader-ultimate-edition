cd "$PSScriptRoot"
$ErrorActionPreference = "Stop"
try {
  Write-Host "Starting Cache server..." -ForegroundColor Green
  $job = Start-Job -ScriptBlock { node "$using:PSScriptRoot\server.js" }
  Start-Sleep -Seconds 3
  $jobState = $job | Get-Job | Select-Object -ExpandProperty State
  if ($jobState -eq "Failed") {
    $err = $job | Receive-Job
    Write-Host "Server failed to start:" -ForegroundColor Red
    Write-Host $err -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
  }
  $child = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $pid }
  if (-not $child) {
    Write-Host "Node process not found after start" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
  }
  Write-Host "Server running! Opening browser..." -ForegroundColor Green
  Start-Process "http://localhost:8080"
  Write-Host "Close this PowerShell window to stop the server" -ForegroundColor Cyan
  Read-Host "Press Enter to stop the server"
  $child | Stop-Process -Force
} catch {
  Write-Host "ERROR: $_" -ForegroundColor Red
  Read-Host "Press Enter to exit"
}
