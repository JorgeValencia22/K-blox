@echo off
chcp 65001 >nul
title Kest Worlds (en linea)
cd /d "%~dp0"
rem Arranca el juego y lo publica en internet con un tunel gratuito de Cloudflare (sin cuenta).
rem Mientras esta ventana siga abierta y el PC encendido, tus amigos pueden entrar con el enlace.

where cloudflared >nul 2>nul
if errorlevel 1 if not exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
  echo [..] Instalando cloudflared...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
)
set CF=cloudflared
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" set CF="C:\Program Files (x86)\cloudflared\cloudflared.exe"

if not exist "node_modules\socket.io" call npm install
if not exist ".env" copy ".env.example" ".env" >nul
call node server/db/init.js >nul
echo [..] Compilando el juego...
call npx vite build --logLevel error
if errorlevel 1 (
  echo [ERROR] No se pudo compilar el juego.
  pause
  exit /b 1
)

start "Kest Worlds - servidor" /min node server/index.js
timeout /t 3 /nobreak >nul
echo.
echo   ============================================================
echo    Busca abajo la linea con  https://....trycloudflare.com
echo    Ese es el enlace para ti y tus amigos. No cierres esta ventana.
echo   ============================================================
echo.
%CF% tunnel --no-autoupdate --url http://127.0.0.1:3000
