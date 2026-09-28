@echo off
cd /d "%~dp0"

echo === Adding all changes ===
git add -A

echo === Committing ===
set /p msg="Commit message (press Enter for 'auto commit'): "
if "%msg%"=="" set msg=auto commit
git commit -m "%msg%"

echo === Pushing to remote ===
git push
if errorlevel 1 (
    echo.
    echo Push failed. Did you set up a remote? Run: git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
    pause
) else (
    echo.
    echo Done! All changes pushed.
    pause
)
