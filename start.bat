@echo off
title BAKAWATCH - Running (Close this window to STOP everything)
color 0A

echo.
echo  ============================================================================
echo   BAKAWATCH - Mangrove Monitoring ^& Restoration System
echo   MENRO Gloria, Oriental Mindoro
echo  ============================================================================
echo.

set ROOT=%~dp0

REM ── 1. Laravel API (port 8000) ───────────────────────────────────────────────
echo  [1/3] Starting Laravel API ...
start "BAKAWATCH - Laravel API" cmd /k "title BAKAWATCH - Laravel API (port 8000) && cd /d "%ROOT%coastalwatch-api" && php artisan config:clear >nul 2>&1 && php artisan serve --port=8000"

REM ── 2. ML Service (port 8001) ────────────────────────────────────────────────
echo  [2/3] Starting ML Service ...
start "BAKAWATCH - ML Service" cmd /k "title BAKAWATCH - ML Service (port 8001) && cd /d "%ROOT%ml-service" && venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8001 --reload"

REM ── 3. Frontend (port 3000) ──────────────────────────────────────────────────
echo  [3/3] Starting Frontend ...
timeout /t 3 /nobreak >nul
start "BAKAWATCH - Frontend" cmd /k "title BAKAWATCH - Frontend (port 3000) && cd /d "%ROOT%coastalwatch-frontend" && npm run dev"

REM ── Wait then open browser ───────────────────────────────────────────────────
echo.
echo  Waiting for services to boot (8 seconds)...
timeout /t 8 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo  ============================================================================
echo.
echo   BAKAWATCH is now RUNNING!
echo.
echo   Frontend  --^>  http://localhost:3000   (open in browser)
echo   API       --^>  http://localhost:8000
echo   ML        --^>  http://localhost:8001
echo.
echo  ============================================================================
echo.
echo   HOW TO STOP:
echo   Option 1 - Press any key HERE in this window
echo   Option 2 - Double-click  STOP BAKAWATCH.bat  in the same folder
echo   Option 3 - Close all 3 terminal windows manually
echo.
echo  ============================================================================
echo.
echo  Press any key to STOP all services and close everything...
pause >nul

REM ── Shutdown all 3 services ───────────────────────────────────────────────────
echo.
echo  Stopping all BAKAWATCH services...
taskkill /FI "WINDOWTITLE eq BAKAWATCH - Laravel API (port 8000)" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BAKAWATCH - ML Service (port 8001)" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BAKAWATCH - Frontend (port 3000)" /T /F >nul 2>&1
echo  Done. All services stopped.
timeout /t 2 /nobreak >nul
