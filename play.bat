@echo off
rem Ebb launcher: builds if needed, then opens the island in its own Chrome window.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
node scripts\play.mjs %*
