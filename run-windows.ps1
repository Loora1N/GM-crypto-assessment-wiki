# Save as UTF-8 with BOM for Windows PowerShell 5.1.

function Get-WikiRegisteredPython {
    # PEP 514: include per-user, all-user and 32-bit registrations.
    foreach ($root in @('HKCU:\Software\Python', 'HKLM:\Software\Python', 'HKLM:\Software\WOW6432Node\Python')) {
        foreach ($company in Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue) {
            foreach ($tag in Get-ChildItem -LiteralPath $company.PSPath -ErrorAction SilentlyContinue) {
                $install = Get-Item -LiteralPath ($tag.PSPath + '\InstallPath') -ErrorAction SilentlyContinue
                if ($null -eq $install) { continue }
                $executable = $install.GetValue('ExecutablePath')
                if ($executable) { $executable }
                $directory = $install.GetValue('')
                if ($directory) { Join-Path $directory 'python.exe' }
            }
        }
    }
}

function Get-WikiPythonCandidates {
    if ($env:WIKI_PYTHON) { [pscustomobject]@{ Path = $env:WIKI_PYTHON; Arguments = @() } }
    foreach ($launcher in Get-Command py.exe -CommandType Application -All -ErrorAction SilentlyContinue) {
        foreach ($version in @('-3', '-3.9')) {
            [pscustomobject]@{ Path = $launcher.Source; Arguments = @($version) }
        }
    }
    foreach ($name in @('python.exe', 'python3.exe', 'python3.9.exe')) {
        foreach ($command in Get-Command $name -CommandType Application -All -ErrorAction SilentlyContinue) {
            # Skip Store execution aliases, which may open an installer instead.
            if ($command.Source -notmatch '\\Microsoft\\WindowsApps\\[^\\]+\.exe$') {
                [pscustomobject]@{ Path = $command.Source; Arguments = @() }
            }
        }
    }
    foreach ($path in Get-WikiRegisteredPython) {
        [pscustomobject]@{ Path = $path; Arguments = @() }
    }
    $directories = @()
    if ($env:LOCALAPPDATA) {
        $directories += Join-Path $env:LOCALAPPDATA 'Programs\Python'
        $directories += Join-Path $env:LOCALAPPDATA 'Python'
    }
    $directories += @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:SystemDrive + '\') | Where-Object { $_ }
    foreach ($directory in $directories) {
        foreach ($install in Get-ChildItem -LiteralPath $directory -Directory -ErrorAction SilentlyContinue) {
            if ($install.Name -like 'Python*') {
                [pscustomobject]@{ Path = (Join-Path $install.FullName 'python.exe'); Arguments = @() }
            }
        }
    }
    foreach ($directory in @($env:USERPROFILE, $env:LOCALAPPDATA, $env:ProgramData) | Where-Object { $_ }) {
        foreach ($name in @('miniconda3', 'anaconda3', 'miniforge3')) {
            [pscustomobject]@{ Path = (Join-Path $directory "$name\python.exe"); Arguments = @() }
        }
    }
}

function Get-WikiPythonInfo {
    param([string]$Path, [string[]]$Arguments = @())
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    try {
        $output = & $Path @Arguments -c 'import json, sys; print(json.dumps(dict(path=sys.executable, version=list(sys.version_info[:3]))))' 2>$null
        if ($LASTEXITCODE -ne 0) { return }
        $info = ($output -join "`n") | ConvertFrom-Json -ErrorAction Stop
        if ($info.path -and $info.version.Count -eq 3) { $info }
    } catch {
        # Stale registry entries and broken launchers must not stop discovery.
    }
}

function Find-WikiPython {
    $seen = @{}
    foreach ($candidate in Get-WikiPythonCandidates) {
        $key = $candidate.Path + '|' + ($candidate.Arguments -join ' ')
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        $info = Get-WikiPythonInfo -Path $candidate.Path -Arguments $candidate.Arguments
        if ($null -eq $info) { continue }
        if ([version]($info.version -join '.') -ge [version]'3.9') { return $info }
        Write-Host ('发现 Python {0}：{1}；本项目需要 3.9 或更新版本。' -f ($info.version -join '.'), $info.path)
    }
}

function Start-WikiPreview {
    $ErrorActionPreference = 'Stop'
    $env:PYTHONUTF8 = '1'
    $env:PYTHONIOENCODING = 'utf-8'
    Remove-Item Env:OFFLINE -ErrorAction SilentlyContinue
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    $OutputEncoding = [Console]::OutputEncoding
    $pushed = $false
    try {
        Push-Location -LiteralPath $PSScriptRoot
        $pushed = $true
        Write-Host '========================================'
        Write-Host '  密评标准知识库 - Windows 一键启动'
        Write-Host '========================================'
        if (-not (Test-Path -LiteralPath 'mkdocs.yml') -or -not (Test-Path -LiteralPath 'requirements.txt')) {
            throw '缺少 mkdocs.yml 或 requirements.txt，请完整解压项目并保留两个 run-windows 启动文件。'
        }
        $venv = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
        if (-not (Test-Path -LiteralPath '.venv')) {
            Write-Host '[1/3] 首次启动，正在寻找 Python...'
            $bootstrap = Find-WikiPython
            if ($null -eq $bootstrap) {
                throw '未找到可用的 Python 3.9 或更新版本。请从 https://www.python.org/downloads/windows/ 安装，或将 WIKI_PYTHON 环境变量设为已安装的 python.exe 完整路径后重试。'
            }
            Write-Host ('使用 Python {0}：{1}' -f ($bootstrap.version -join '.'), $bootstrap.path)
            & $bootstrap.path -m venv (Join-Path $PSScriptRoot '.venv') | Out-Host
            if ($LASTEXITCODE -ne 0) { throw '创建 .venv 失败，请查看上方错误信息并检查文件夹写入权限。' }
        }
        Write-Host '[1/3] 检查项目 Python 环境...'
        $info = Get-WikiPythonInfo -Path $venv
        if ($null -eq $info -or [version]($info.version -join '.') -lt [version]'3.9') {
            throw '项目 .venv 无法使用或 Python 低于 3.9。跨电脑复制的环境不能复用；请将 .venv 重命名为 .venv-backup 后重新启动。'
        }
        Write-Host ('项目 Python {0}：{1}' -f ($info.version -join '.'), $info.path)
        Write-Host '[2/3] 检查并安装依赖，首次安装需要联网，请稍候...'
        & $venv -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements.txt') | Out-Host
        if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请查看上方错误信息，检查网络和 Python 软件包源后重试。' }
        Write-Host '[3/3] 正在生成页面，完成后会自动打开默认浏览器。'
        Write-Host '地址：http://127.0.0.1:8000/GM-crypto-assessment-wiki/'
        Write-Host '使用期间请保留此窗口；关闭窗口即可停止服务。保存文章后，页面会自动更新。'
        & $venv -m mkdocs serve --dev-addr 127.0.0.1:8000 --open | Out-Host
        if ($LASTEXITCODE -ne 0) { throw '预览服务已退出，请查看上方错误信息。如果端口 8000 被占用，请关闭之前的启动窗口后重试。' }
        Write-Host '服务已停止。'
        return 0
    } catch {
        Write-Host ('[错误] ' + $_.Exception.Message) -ForegroundColor Red
        return 1
    } finally {
        if ($pushed) { Pop-Location }
    }
}

# Dot-sourcing exposes discovery functions for isolated Windows regression tests.
if ($MyInvocation.InvocationName -ne '.') { exit (Start-WikiPreview) }
