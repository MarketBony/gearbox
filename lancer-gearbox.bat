@echo off
set "PROJECT_DIR=%~dp0"

start "Gearbox Dev Server" cmd /k "cd /d "%PROJECT_DIR%" && npm run dev"

timeout /t 3 /nobreak >nul

start "Claude" cmd /k "cd /d "%PROJECT_DIR%" && claude"
