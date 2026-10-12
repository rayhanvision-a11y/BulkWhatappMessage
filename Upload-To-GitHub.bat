@echo off
setlocal EnableDelayedExpansion
title WhatsApp System - Push Project to GitHub
color 0b
cd /d "%~dp0"

echo ================================================================
echo           WhatsApp System - GitHub Project Uploader
echo ================================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    color 0c
    echo [ERROR] Git is not installed or not in system PATH!
    echo Please install Git from: https://git-scm.com
    echo.
    pause
    exit /b 1
)

:: 1. Ensure .gitignore exists
if not exist ".gitignore" (
    echo [SETUP] Creating secure .gitignore...
    (
        echo node_modules/
        echo bin/node.exe
        echo auth_info_*/
        echo baileys_store_*.json
        echo *.log
        echo *.zip
        echo scratch/
        echo github_config.json
    ) > .gitignore
)

:: 2. Initialize Git repo if needed
if not exist ".git" (
    echo [*] Initializing new Git repository...
    git init
    git branch -M main
)

:: 3. Check existing remote origin
set "CURRENT_ORIGIN="
for /f "tokens=*" %%a in ('git remote get-url origin 2^>nul') do set "CURRENT_ORIGIN=%%a"

if "!CURRENT_ORIGIN!"=="" (
    echo.
    echo [*] No remote GitHub repository linked yet.
    echo Please create a new PRIVATE repository on https://github.com/new
    echo.
    set /p "REPO_URL=Enter your GitHub Repository URL: "
    if "!REPO_URL!"=="" (
        color 0c
        echo [ERROR] Repository URL cannot be empty!
        pause
        exit /b 1
    )
    git remote add origin !REPO_URL!
    echo [OK] Remote origin set to: !REPO_URL!
) else (
    echo [*] Current remote: !CURRENT_ORIGIN!
)

:: 4. Stage and commit
echo.
echo [*] Staging project files (sensitive WhatsApp credentials are automatically excluded)...
git add .

echo [*] Committing changes...
set /p "COMMIT_MSG=Enter commit message (Press Enter for default): "
if "!COMMIT_MSG!"=="" set "COMMIT_MSG=feat: WhatsApp Management System with Silent Launcher and GitHub Cloud Sync"

git commit -m "!COMMIT_MSG!"

:: 5. Push to GitHub
echo.
echo [*] Pushing to GitHub (main branch)...
git push -u origin main

if errorlevel 1 (
    color 0e
    echo.
    echo [NOTE] If push was rejected, you might need to force push or pull first:
    echo        1. git pull origin main --rebase
    echo        2. git push -u origin main
    echo Or if it's a completely brand new repo:
    echo        git push -u origin main --force
    echo.
) else (
    color 0a
    echo.
    echo ================================================================
    echo   [SUCCESS] Full project successfully uploaded to GitHub!
    echo ================================================================
    echo.
    echo Global templates and Quick Select lists can now be synced
    echo seamlessly using the "Cloud Sync" button inside WhatsApp Portal.
    echo.
)

pause
