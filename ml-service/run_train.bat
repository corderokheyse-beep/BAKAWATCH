@echo off
REM Train the mangrove species classifier
REM Uses the Python 3.11 virtual environment created by uv

echo Training MobileNetV2 mangrove species classifier...
echo This takes 30-60 minutes on CPU, faster with a GPU.
echo.

.venv\Scripts\python.exe train_model.py
pause
