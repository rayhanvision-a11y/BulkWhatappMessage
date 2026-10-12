@echo off
title WhatsApp Management System
cd /d "%~dp0"

:: Launch portal through the silent VBS launcher (prevents console flickering)
start "" wscript.exe "%~dp0WhatsApp-Portal.vbs"
exit
