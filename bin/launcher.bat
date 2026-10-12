@echo off
setlocal
cd /d "%~dp0.."

set "NODE_EXE=%~dp0node.exe"
if not exist "%NODE_EXE%" (
    set "NODE_EXE=node"
)

:: Check if dependencies are installed
if not exist "%~dp0..\node_modules\@whiskeysockets\baileys" (
    echo Installing dependencies...
    call npm install
)

:: Check if port 3000 is already active
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'server.js' -WorkingDirectory '%~dp0..' -WindowStyle Hidden"
    
    :: Wait up to 5 seconds
    set /a attempts=0
    :wait_loop
    timeout /t 1 /nobreak >nul 2>&1
    netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
    if errorlevel 1 (
        set /a attempts+=1
        if %attempts% lss 5 goto wait_loop
    )
)

:: Find Chrome or Edge for standalone App Mode (Frameless window)
set "BROWSER="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

if defined BROWSER (
    start "" "%BROWSER%" --app=http://localhost:3000
) else (
    start http://localhost:3000
)
