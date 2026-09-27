@echo off
title Deploy Direto para o RAILWAY - NEXUS DARWIN CLOUD
cd /d "%~dp0"
echo ======================================================================
echo   NEXUS DARWIN CLOUD - DEPLOY PARA O RAILWAY 24/7
echo ======================================================================
echo 1. Enviando ultima versao para o GitHub...
git push -u origin main --force
echo.
echo 2. Iniciando Railway CLI (faca login se solicitado)...
call npx.cmd -y @railway/cli@latest login
call npx.cmd -y @railway/cli@latest init
call npx.cmd -y @railway/cli@latest up
echo.
echo ======================================================================
echo   DEPLOY NO RAILWAY FINALIZADO!
echo ======================================================================
pause
