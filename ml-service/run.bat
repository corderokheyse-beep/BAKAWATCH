@echo off
REM Start the CoastalWatch Mangrove ML Service
REM Uses the Python 3.13 virtual environment

echo Starting CoastalWatch Mangrove Classifier API...
echo Listening on http://127.0.0.1:8001
echo Press Ctrl+C to stop.
echo.

venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8001 --reload
