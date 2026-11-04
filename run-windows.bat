@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Keep this entry point ASCII-only: GitHub ZIP archives may use LF endings.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-windows.ps1"
set "WIKI_EXIT_CODE=%ERRORLEVEL%"
echo.
pause
exit /b %WIKI_EXIT_CODE%
