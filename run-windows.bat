@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
title 密评标准知识库 - Windows 本地预览

pushd "%~dp0"
if errorlevel 1 goto directory_error
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "OFFLINE="

echo ========================================
echo   密评标准知识库 - Windows 一键启动
echo ========================================
echo.
if not exist "mkdocs.yml" goto project_error
if not exist "requirements.txt" goto project_error
if exist ".venv\Scripts\python.exe" goto check_environment
if exist ".venv" goto environment_error

echo [1/3] 首次启动，正在寻找 Python...
set "WIKI_BOOTSTRAP=py -3.12"
py -3.12 -c "import sys; sys.exit(sys.version_info < (3, 12))" >nul 2>&1
if not errorlevel 1 goto create_environment
set "WIKI_BOOTSTRAP=py -3"
py -3 -c "import sys; sys.exit(sys.version_info < (3, 12))" >nul 2>&1
if not errorlevel 1 goto create_environment
set "WIKI_BOOTSTRAP=python"
python -c "import sys; sys.exit(sys.version_info < (3, 12))" >nul 2>&1
if not errorlevel 1 goto create_environment
echo [错误] 未找到 Python 3.12 或更新版本。
echo 请从 https://www.python.org/downloads/windows/ 安装 Python，建议使用 3.12。
echo 安装时勾选 Add python.exe to PATH，然后重新双击 run-windows.bat。
goto failure

:create_environment
echo 正在创建项目专用环境 .venv，请稍候...
%WIKI_BOOTSTRAP% -m venv ".venv"
if errorlevel 1 goto environment_error

:check_environment
echo [1/3] 检查项目 Python 环境...
".venv\Scripts\python.exe" -c "import sys; sys.exit(sys.version_info < (3, 12))" >nul 2>&1
if errorlevel 1 goto environment_error

echo.
echo [2/3] 检查并安装依赖，首次安装需要联网，请稍候...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r "requirements.txt"
if errorlevel 1 goto dependency_error

echo.
echo [3/3] 正在生成页面，完成后会自动打开默认浏览器。
echo 地址：http://127.0.0.1:8000/GM-crypto-assessment-wiki/
echo 使用期间请保留此窗口；关闭窗口即可停止服务。
echo 保存文章后，页面会自动更新。
echo.
".venv\Scripts\python.exe" -m mkdocs serve --dev-addr 127.0.0.1:8000 --open
if errorlevel 1 goto server_error
echo.
echo 服务已停止。
popd
pause
exit /b 0

:project_error
echo [错误] 缺少 mkdocs.yml 或 requirements.txt。
echo 请完整解压项目，并将 run-windows.bat 保留在项目根目录。
goto failure

:environment_error
echo [错误] 项目 Python 环境无法使用，需要 Python 3.12 或更新版本。
echo 请先安装 Python 3.12；若 .venv 已存在，可将其重命名为 .venv-backup 后重新启动。
goto failure

:dependency_error
echo.
echo [错误] 依赖安装失败，请查看上方错误信息。
echo 请检查网络连接，确认可以访问 Python 软件包源，然后重新双击 run-windows.bat。
goto failure

:server_error
echo.
echo [错误] 预览服务已退出，请查看上方错误信息。
echo 如果提示端口 8000 被占用，请关闭之前打开的启动窗口后重试。
goto failure

:failure
popd
echo.
pause
exit /b 1

:directory_error
echo [错误] 无法进入项目目录，请检查文件夹是否可访问。
pause
exit /b 1
