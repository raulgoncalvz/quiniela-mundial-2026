@echo off
echo.
echo  ====================================
echo   QUINIELA MUNDIAL 2026
echo   FIFA World Cup USA / Canada / Mexico
echo  ====================================
echo.

REM === BACKEND ===
echo [1/2] Iniciando backend...
cd /d "%~dp0backend"

if not exist node_modules (
    echo  Instalando dependencias del backend...
    call npm install
    call npx prisma generate
    call npx prisma db push
    call node prisma/seed.js
)

start "Backend - Quiniela 2026" cmd /k "node server.js"
timeout /t 2 /nobreak > nul

REM === FRONTEND ===
echo [2/2] Iniciando frontend...
cd /d "%~dp0frontend"

if not exist node_modules (
    echo  Instalando dependencias del frontend...
    call npm install
)

start "Frontend - Quiniela 2026" cmd /k "npm run dev"
timeout /t 3 /nobreak > nul

echo.
echo  ✅ Todo iniciado correctamente!
echo.
echo  Backend:  http://localhost:3001
echo  Frontend: http://localhost:5173
echo.
echo  Admin:    admin@quiniela.com / admin123
echo  Demo:     demo@quiniela.com  / demo123
echo.
start "" http://localhost:5173
pause
