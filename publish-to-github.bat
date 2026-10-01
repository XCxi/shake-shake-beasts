@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Publish Shake Shake Beasts to GitHub

echo ============================================
echo   Publish to GitHub
echo ============================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [x] git not found. Install Git for Windows first:
  echo     https://git-scm.com/download/win
  pause & exit /b 1
)

set "REPO=%~1"

rem --- reuse the origin already configured in this repo, so a repeat publish needs no typing ---
if "!REPO!"=="" (
  for /f "usebackq delims=" %%r in (`git remote get-url origin 2^>nul`) do set "REPO=%%r"
)

if "!REPO!"=="" (
  echo Step 1: create an EMPTY repo at https://github.com/new
  echo         repo name example:  shake-shake-beasts
  echo         do NOT tick "Add a README"
  echo.
  echo Step 2: paste its URL below, like
  echo         https://github.com/YOURNAME/shake-shake-beasts.git
  echo.
  set /p REPO=Repo URL: 
)

if "!REPO!"=="" (
  echo [x] empty repo URL, abort.
  pause & exit /b 1
)
echo Target repo: !REPO!
echo.

rem --- make a commit if this folder is not a repo yet ---
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  git init -b main
  git config user.name "ShakeShakeBeasts"
  git config user.email "mengshou@users.noreply.github.com"
  git add -A
  git commit -m "Shake Shake Beasts v1.0 - shockwave chain-merge physics game"
)
git add -A
git diff --cached --quiet
if errorlevel 1 git commit -m "update"

rem --- on this machine git's schannel backend cannot get credentials; use OpenSSL ---
git config http.sslBackend openssl
git remote remove origin >nul 2>nul

if "%~2"=="" (
  git remote add origin "!REPO!"
) else (
  set "TOKENURL=!REPO:https://=https://x-access-token:%~2@!"
  git remote add origin "!TOKENURL!"
)

echo.
echo Pushing... a browser window may open to log in to GitHub (one time only).
echo.
git push -u origin main
if errorlevel 1 (
  echo.
  echo [x] Push failed. Common reasons:
  echo     1. wrong repo URL, or the repo does not exist yet
  echo     2. the browser login was cancelled
  echo     3. push with a personal access token instead:
  echo        publish-to-github.bat https://github.com/USER/REPO.git YOUR_TOKEN
  pause & exit /b 1
)

rem --- keep the token out of .git/config ---
git remote set-url origin "!REPO!"

for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command "$r='!REPO!' -replace '\.git$',''; if($r -match 'github\.com[:/]([^/]+)/(.+)$'){ 'https://' + $Matches[1] + '.github.io/' + $Matches[2] + '/' }"`) do set PAGES=%%u

echo.
echo ============================================
echo   [OK] code pushed
echo ============================================
echo.
echo Last step, 30 seconds:
echo   open your repo - Settings - Pages
echo   Source: Deploy from a branch
echo   Branch: main      Folder: / (root)      then Save
echo.
echo After about one minute the game is live at:
echo   !PAGES!
echo.
echo Then replace the placeholder line in README.md with that URL.
echo.
pause
