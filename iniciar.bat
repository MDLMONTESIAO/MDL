@echo off
cd /d "%~dp0"
start "" "http://localhost:3031"
node server.js
