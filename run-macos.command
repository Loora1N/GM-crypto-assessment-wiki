#!/bin/bash

# Compatible with the Bash shipped with macOS. Keep this file in LF format.
set -u

pause_and_exit() {
    printf '\n按回车键关闭此窗口...'
    read -r _ || true
    exit "$1"
}

fail() {
    printf '\n%s\n' "$@"
    pause_and_exit 1
}

environment_error() {
    fail '[错误] 项目 Python 环境无法使用，需要 Python 3.12 或更新版本。' \
         '请先安装 Python 3.12；若 .venv 已存在，可将其重命名为 .venv-backup 后重新启动。' \
         'Windows 和 macOS 的 .venv 不能共用，请在当前系统创建环境。'
}

cd -- "$(dirname "${BASH_SOURCE[0]}")" || fail '[错误] 无法进入项目目录，请检查文件夹是否可访问。'
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
unset OFFLINE
# Finder launches may not include Python.org or Homebrew in PATH.
export PATH="/Library/Frameworks/Python.framework/Versions/3.12/bin:/Library/Frameworks/Python.framework/Versions/Current/bin:/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin}"

printf '%s\n' '========================================' \
    '  密评标准知识库 - macOS 一键启动' \
    '========================================'

if [[ ! -f mkdocs.yml || ! -f requirements.txt ]]; then
    fail '[错误] 缺少 mkdocs.yml 或 requirements.txt。' \
         '请完整解压项目，并将 run-macos.command 保留在项目根目录。'
fi

venv_python='.venv/bin/python'
if [[ ! -x "$venv_python" ]]; then
    [[ ! -e .venv ]] || environment_error
    printf '\n[1/3] 首次启动，正在寻找 Python...\n'
    bootstrap=''
    for candidate in python3.12 python3; do
        if command -v "$candidate" >/dev/null 2>&1 && \
           "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 12))' >/dev/null 2>&1; then
            bootstrap="$candidate"
            break
        fi
    done
    if [[ -z "$bootstrap" ]]; then
        fail '[错误] 未找到 Python 3.12 或更新版本。' \
             '请从 https://www.python.org/downloads/macos/ 安装 Python，建议使用 3.12。' \
             '安装完成后，重新双击 run-macos.command。'
    fi
    printf '正在创建项目专用环境 .venv，请稍候...\n'
    "$bootstrap" -m venv .venv || environment_error
fi

printf '\n[1/3] 检查项目 Python 环境...\n'
"$venv_python" -c 'import sys; sys.exit(sys.version_info < (3, 12))' >/dev/null 2>&1 || environment_error

printf '\n[2/3] 检查并安装依赖，首次安装需要联网，请稍候...\n'
"$venv_python" -m pip install --disable-pip-version-check -r requirements.txt || \
    fail '[错误] 依赖安装失败，请查看上方错误信息。' \
         '请检查网络连接，确认可以访问 Python 软件包源，然后重新双击 run-macos.command。'

printf '\n%s\n' '[3/3] 正在生成页面，完成后会自动打开默认浏览器。' \
    '地址：http://127.0.0.1:8000/GM-crypto-assessment-wiki/' \
    '使用期间请保留此窗口；关闭窗口或按 Control+C 即可停止服务。' \
    '保存文章后，页面会自动更新。'
"$venv_python" -m mkdocs serve --dev-addr 127.0.0.1:8000 --open
server_status=$?
if [[ "$server_status" -ne 0 && "$server_status" -ne 130 ]]; then
    fail '[错误] 预览服务已退出，请查看上方错误信息。' \
         '如果提示端口 8000 被占用，请关闭之前打开的启动窗口后重试。'
fi
printf '\n服务已停止。\n'
pause_and_exit 0
