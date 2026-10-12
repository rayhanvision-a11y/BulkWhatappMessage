@echo off
setlocal EnableDelayedExpansion
title WhatsApp Web Management System
cd /d "%~dp0"
color 0a

echo ================================================================
echo           WhatsApp Web Management System Launcher
echo ================================================================
echo.

:: 1. Check Node.js availability
set "NODE_BIN="
if exist "%~dp0bin\node.exe" (
    set "NODE_BIN=%~dp0bin\node.exe"
) else (
    where node >nul 2>&1
    if not errorlevel 1 (
        set "NODE_BIN=node"
    )
)

if "%NODE_BIN%"=="" (
    color 0c
    echo [ERROR] Node.js is not installed or not found in system PATH!
    echo.
    echo Please install Node.js from https://nodejs.org (LTS Recommended)
    echo Once installed, double-click this file again.
    echo.
    pause
    exit /b 1
)

:: 2. Ensure dependencies are installed
if not exist "%~dp0node_modules\@whiskeysockets\baileys" (
    color 0e
    echo [SETUP] First time setup: Missing required packages!
    echo [*] Automatically installing Baileys, Express, and libraries now...
    echo [*] This will take approximately 15-30 seconds depending on internet speed...
    echo.
    call npm install --omit=dev --no-audit --no-fund
    if errorlevel 1 (
        color 0c
        echo.
        echo [ERROR] Automatic installation encountered an issue.
        echo Please ensure you have internet connection and run:
        echo    npm install
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] All dependencies successfully installed!
    echo.
    color 0a
)

echo [*] Server is starting on http://localhost:3000
echo [*] Opening portal in your web browser...
echo.

:: 3. Launch browser after a brief delay in the background (no window flicker)
start "" /b cmd /c "timeout /t 2 /nobreak >nul 2>&1 & start http://localhost:3000"

:: 4. Start the Node.js server in this window
"%NODE_BIN%" server.js

if errorlevel 1 (
    color 0c
    echo.
    echo [ERROR] WhatsApp server exited with an error code.
    pause
)
