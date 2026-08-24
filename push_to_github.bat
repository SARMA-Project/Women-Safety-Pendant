@echo off
echo ========================================================
echo   AUTOMATED APK BUILD - GITHUB PUSH SCRIPT
echo ========================================================
echo.
echo Target Repository: https://github.com/SARMA-Project/Women-Safety-Pendant.git
echo.
echo Initializing Git repository and pushing code...

git init
git config user.email "sarma@example.com"
git config user.name "SARMA-Project"
git add .
git commit -m "Build Smart Safety Pendant APK"
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/SARMA-Project/Women-Safety-Pendant.git
git push -u origin main --force

echo.
echo ========================================================
echo SUCCESS! Code pushed to GitHub.
echo The GitHub Action is now building your APK!
echo Check progress at: https://github.com/SARMA-Project/Women-Safety-Pendant/actions
echo ========================================================
pause
