@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Kest Worlds
cd /d "%~dp0"

echo.
echo   =============================================
echo     KEST WORLDS - plataforma de mundos 3D
echo   =============================================
echo.

rem --- 1. Node.js ----------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encuentra Node.js.
  echo         Instala Node.js 22.13 o superior desde https://nodejs.org y vuelve a ejecutar start.bat
  pause
  exit /b 1
)
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
for /f "tokens=1,2 delims=." %%a in ('node -v') do set NODE_VER=%%a.%%b
set NODE_VER=%NODE_VER:v=%
for /f "tokens=1,2 delims=." %%a in ("%NODE_VER%") do (
  set MAJ=%%a
  set MIN=%%b
)
if !MAJ! LSS 22 (
  echo [ERROR] Tu version de Node.js es !NODE_VER!. Se necesita 22.13 o superior ^(por el modulo integrado node:sqlite^).
  pause
  exit /b 1
)
if !MAJ! EQU 22 if !MIN! LSS 13 (
  echo [ERROR] Tu version de Node.js es !NODE_VER!. Se necesita 22.13 o superior.
  pause
  exit /b 1
)
echo [OK] Node.js !NODE_VER!

rem --- 2. Dependencias -----------------------------------------------------
if not exist "node_modules\socket.io" (
  echo [..] Instalando dependencias ^(solo la primera vez^)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] No se pudieron instalar las dependencias. Revisa tu conexion a Internet.
    pause
    exit /b 1
  )
)
if not exist "node_modules\vite" (
  call npm install
)
echo [OK] Dependencias instaladas

rem --- 3. Configuracion ----------------------------------------------------
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo [OK] Creado .env a partir de .env.example
)

rem --- 4. Base de datos ----------------------------------------------------
call node server/db/init.js
if errorlevel 1 (
  echo [ERROR] No se pudo inicializar la base de datos.
  pause
  exit /b 1
)

rem --- 5. Compilar el cliente ----------------------------------------------
if "%1"=="dev" goto dev
echo [..] Compilando el cliente...
call npx vite build --logLevel warn
if errorlevel 1 (
  echo [ERROR] Fallo al compilar el cliente.
  pause
  exit /b 1
)
echo [OK] Cliente compilado

rem --- 6. Iniciar ------------------------------------------------------------
set PORT_VAL=3000
for /f "tokens=1,2 delims==" %%a in ('findstr /b "PORT=" .env') do set PORT_VAL=%%b
echo.
echo   Abre en tu navegador:  http://localhost:!PORT_VAL!
echo   Para jugar con otros equipos de tu red usa la IP de este ordenador.
echo   Pulsa Ctrl+C para detener el servidor.
echo.
start "" "http://localhost:!PORT_VAL!"
node server/index.js
if errorlevel 1 (
  echo.
  echo [ERROR] El servidor se ha detenido con un error. Revisa los mensajes anteriores.
  pause
)
exit /b 0

:dev
echo [..] Modo desarrollo: servidor en :3000 y cliente con recarga en http://localhost:5173
start "" "http://localhost:5173"
call npm run dev
pause
