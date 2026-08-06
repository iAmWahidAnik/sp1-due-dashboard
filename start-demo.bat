@echo off
cd /d %~dp0standalone
python -m http.server 8080
