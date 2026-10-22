@echo off
REM Download the iNaturalist mangrove species dataset
REM Uses the Python 3.11 virtual environment created by uv

echo Downloading mangrove species dataset from iNaturalist...
echo This will download up to 300 images per species (~1,800 total).
echo.

.venv\Scripts\python.exe download_dataset.py
pause
