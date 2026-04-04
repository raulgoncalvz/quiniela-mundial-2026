@echo off
echo.
echo  ====================================
echo   SETUP INICIAL - QUINIELA 2026
echo   (Solo ejecutar la PRIMERA VEZ)
echo  ====================================
echo.

REM === BACKEND SETUP ===
echo [1/3] Configurando backend...
cd /d "%~dp0backend"
call npm install
echo.
echo [2/3] Creando base de datos y cargando datos...
call npx prisma generate
call npx prisma db push
call node prisma/seed.js
echo.

REM === FRONTEND SETUP ===
echo [3/3] Instalando dependencias del frontend...
cd /d "%~dp0frontend"
call npm install
echo.

echo  ====================================
echo   ✅ Setup completado!
echo.
echo   Ahora ejecuta: start.bat
echo  ====================================
echo.
pause
