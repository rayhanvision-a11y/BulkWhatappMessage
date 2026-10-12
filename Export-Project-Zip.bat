@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

title WhatsApp System - Zip Exporter
color 0b

echo ================================================================
echo           WhatsApp System - Package Exporter
echo ================================================================
echo.
echo  Choose Export Package Type:
echo ----------------------------------------------------------------
echo  [1] Ready-to-Run (Includes node_modules - NO 'npm install' needed! ~14 MB)
echo      * Recommended for moving to other folders or sharing with clients
echo.
echo  [2] Standalone Portable (Includes node_modules + Portable node.exe, ~45 MB)
echo      * Works on any PC even if Node.js is NOT installed!
echo.
echo  [3] Source Code Only (Excludes node_modules and node.exe, ~150 KB)
echo      * Requires running 'npm install' after extraction
echo ----------------------------------------------------------------
echo.

set "CHOICE=1"
set /p "CHOICE=Select option [1, 2, or 3] (Press Enter for 1): "

if exist "whatsapp-system.zip" (
    echo Cleaning previous whatsapp-system.zip...
    del /f /q "whatsapp-system.zip" >nul 2>&1
)

echo.
echo Creating whatsapp-system.zip... Please wait...

if "%CHOICE%"=="2" (
    tar -a -c -f "whatsapp-system.zip" ^
        --exclude="auth_info_*" ^
        --exclude="baileys_store_*" ^
        --exclude="*.log" ^
        --exclude="*.zip" ^
        --exclude="scratch" ^
        --exclude=".git" ^
        *
) else if "%CHOICE%"=="3" (
    tar -a -c -f "whatsapp-system.zip" ^
        --exclude="node_modules" ^
        --exclude="auth_info_*" ^
        --exclude="baileys_store_*" ^
        --exclude="*.log" ^
        --exclude="*.zip" ^
        --exclude="scratch" ^
        --exclude=".git" ^
        --exclude="bin/node.exe" ^
        *
) else (
    tar -a -c -f "whatsapp-system.zip" ^
        --exclude="auth_info_*" ^
        --exclude="baileys_store_*" ^
        --exclude="*.log" ^
        --exclude="*.zip" ^
        --exclude="scratch" ^
        --exclude=".git" ^
        --exclude="bin/node.exe" ^
        *
)

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Export failed! Ensure tar.exe is accessible and no app has locked the zip file.
) else (
    echo.
    echo ================================================================
    echo  SUCCESS! Archive created:
    echo  Path: %~dp0whatsapp-system.zip
    echo ================================================================
)

echo.
pause
