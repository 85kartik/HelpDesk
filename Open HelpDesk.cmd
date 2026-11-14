@echo off
cd /d "%~dp0"
if not exist ".local" mkdir ".local"
powershell -NoProfile -Command "if (!(Test-NetConnection 127.0.0.1 -Port 27017 -InformationLevel Quiet -WarningAction SilentlyContinue)) { Start-Process -FilePath 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe' -ArgumentList '--bind_ip','127.0.0.1','--dbpath',([char]34 + (Join-Path (Get-Location) '.local') + [char]34) -WindowStyle Hidden }"
start "HelpDesk API" /D "%~dp0server" cmd /k npm.cmd start
start "HelpDesk Web" /D "%~dp0client" cmd /k npm.cmd run dev -- --strictPort
powershell -NoProfile -Command "for ($i=0; $i -lt 30; $i++) { try { Invoke-RestMethod http://localhost:5173/api/health -TimeoutSec 2 -ErrorAction Stop | Out-Null; Start-Process http://localhost:5173; exit 0 } catch { Start-Sleep 1 } }; exit 1"
if errorlevel 1 (
 echo HelpDesk did not start. Check the HelpDesk API and HelpDesk Web windows for errors.
 pause
)
