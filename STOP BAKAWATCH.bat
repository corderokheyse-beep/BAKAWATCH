@echo off
title BAKAWATCH - Stopping...
color 0C
echo.
echo  Stopping all BAKAWATCH services...
echo.
taskkill /FI "WINDOWTITLE eq BAKAWATCH - Laravel API (port 8000)" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BAKAWATCH - ML Service (port 8001)" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BAKAWATCH - Frontend (port 3000)" /T /F >nul 2>&1
echo  All BAKAWATCH services have been stopped.
echo.
pause
