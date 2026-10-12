@echo off
title Stop WhatsApp System Server
echo ============================================
echo   Stopping WhatsApp System Server...
echo ============================================
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo.
echo Server has been stopped successfully.
ping 127.0.0.1 -n 3 >nul 2>&1
