@echo off
title Enviando NEXUS DARWIN CLOUD para o GitHub
cd /d "%~dp0"
echo ======================================================================
echo   ENVIANDO PROJETO PARA O GITHUB:
echo   https://github.com/joaopablosouza742-byte/NEXUS-DARWIN-AI.git
echo ======================================================================
git branch -M main
git remote set-url origin https://github.com/joaopablosouza742-byte/NEXUS-DARWIN-AI.git
echo.
echo Enviando arquivos para o GitHub...
git push -u origin main --force
echo.
echo ======================================================================
echo   PROCESSO CONCLUIDO! Pode atualizar a pagina do GitHub!
echo ======================================================================
pause
