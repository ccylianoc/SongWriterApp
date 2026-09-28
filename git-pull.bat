@echo off
cd /d "%~dp0"

echo === Pulling latest from remote ===
git pull

if errorlevel 1 (
    echo.
    echo Pull failed. Make sure you have a remote set up and are on the right branch.
    pause
) else (
    echo.
    echo Done! Project is up to date.
    pause
)
