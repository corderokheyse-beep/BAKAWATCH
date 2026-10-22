@echo off
title BAKAWATCH - Stopping All Services
echo.
echo  Stopping all BAKAWATCH services...
taskkill /FI "WINDOWTITLE eq BAKAWATCH - Laravel API" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BAKAWATCH - ML Service" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BAKAWATCH - Frontend" /T /F >nul 2>&1
echo  All services stopped.
timeout /t 2 /nobreak >nul
