@echo off
title Create Desktop Shortcut
cd /d "%~dp0"
echo ================================================================
echo        Creating Desktop Shortcut for WhatsApp Portal...
echo ================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$vbs = '%~dp0WhatsApp-Portal.vbs'; " ^
  "$workDir = '%~dp0'.TrimEnd('\'); " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$lnkPath = Join-Path $desktop 'WhatsApp Portal.lnk'; " ^
  "$s = $ws.CreateShortcut($lnkPath); " ^
  "$s.TargetPath = 'wscript.exe'; " ^
  "$s.Arguments = '\""' + $vbs + '\""'; " ^
  "$s.WorkingDirectory = $workDir; " ^
  "$s.WindowStyle = 1; " ^
  "$s.Description = 'WhatsApp Management System'; " ^
  "$icons = @('C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe', ($env:SystemRoot + '\System32\shell32.dll')); " ^
  "foreach ($ic in $icons) { if (Test-Path $ic) { $s.IconLocation = $ic + ',0'; break } }; " ^
  "$s.Save();"

echo.
echo ================================================================
echo   [OK] Shortcut 'WhatsApp Portal' created on your Desktop!
echo ================================================================
echo.
echo You can now launch WhatsApp Portal directly from your Desktop.
echo.
pause
