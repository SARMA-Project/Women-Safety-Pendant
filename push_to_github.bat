@echo off
echo ========================================================
echo   AUTOMATED APK BUILD - GITHUB PUSH SCRIPT
echo ========================================================
echo.
set /p REPO_URL="Enter your GitHub Repository URL (e.g. https://github.com/username/safety-pendant.git): "

if "%REPO_URL%"=="" (
    echo Error: No repository URL provided. Exiting.
    pause
    exit /b 1
)

echo.
echo Initializing Git repository...
git init
git add .
git commit -m "Build Smart Safety Pendant APK"
git branch -M main
git remote add origin %REPO_URL%
git push -u origin main --force

echo.
echo ========================================================
echo SUCCESS! Repository pushed to GitHub.
echo The GitHub Action is now automatically building your APK!
echo Go to %REPO_URL%/actions to download app-debug.apk
echo ========================================================
pause
