# 密评标准知识库

基于 **MkDocs + Material for MkDocs** 搭建的密码学习与测评文档站点，用于整理标准条款、算法与协议笔记、密码产品资料和测评经验。

[在线知识库](https://loora1n.github.io/GM-crypto-assessment-wiki/) · [从 0 开始上传笔记](docs/index.md) · [项目维护参考](docs/maintenance/维护参考/维护参考.md)

## 内容分类

文章按四个章节组织，每章再按二级主题分类：

| 章节 | 目录 | 内容示例 |
| --- | --- | --- |
| [密码算法](docs/algorithm/index.md) | `docs/algorithm/` | 对称密码算法、非对称密码算法、杂凑算法 |
| [密码协议](docs/protocol/index.md) | `docs/protocol/` | 安全传输协议、认证协议、密钥交换协议 |
| [密码产品](docs/product/index.md) | `docs/product/` | 智能密码钥匙、服务器密码机、密钥管理设备 |
| [密码测评](docs/assessment/index.md) | `docs/assessment/` | 测评基础、测评实施、案例与学习笔记 |

站点支持中文／英文搜索、浅色／深色切换、代码高亮与复制、提示块、数学公式和离线浏览。

## 本地运行

准备 **Git、Python 3.12** 和 Markdown 编辑器。以下命令用于 Windows PowerShell；已克隆仓库的同事进入现有项目目录，跳过克隆步骤。

```powershell
git clone https://github.com/Loora1N/GM-crypto-assessment-wiki.git
Set-Location .\GM-crypto-assessment-wiki

py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m mkdocs serve
```

浏览器打开终端打印的完整地址，默认是：

**[http://127.0.0.1:8000/GM-crypto-assessment-wiki/](http://127.0.0.1:8000/GM-crypto-assessment-wiki/)**

保存文档后，服务会自动重新构建。按 `Ctrl+C` 停止服务。命令直接使用 `.venv` 的 Python，不需要激活虚拟环境；之后再次启动只需运行最后一条命令。

第一次安装工具、配置 Git 或上传笔记，请按[首页快速开始](docs/index.md)逐步操作。

## 项目结构

```text
GM-crypto-assessment-wiki/
├── README.md                    # 仓库介绍与启动入口
├── mkdocs.yml                   # 网站配置、导航和 Markdown 扩展
├── requirements.txt             # Python 依赖
├── THEME.md                     # Blue Topaz Maple 主题说明
├── docs/
│   ├── index.md                 # 从零快速开始：首页
│   ├── maintenance/             # 完整维护参考
│   ├── algorithm/               # 密码算法
│   ├── protocol/                # 密码协议
│   ├── product/                 # 密码产品
│   ├── assessment/              # 密码测评
│   └── assets/                  # 网站公共样式、脚本和第三方资源
└── .github/workflows/docs.yml   # 文档检查与自动发布
```

`.venv/`、`site/` 和 `site-offline/` 是本机环境或构建产物，已由 `.gitignore` 排除，不提交到文章源码分支。

## 新增或修改文章

1. 通过 Git 同步 `main`，为本次任务创建个人分支。
2. 将文章归入四个章节之一，按“章节 / 二级分类 / 文章名称”建立独立目录，Markdown、图片和附件全部随文章保存。
3. 标准类文章写清编号与完整名称：国标使用 `GBT12345-2017` 形式，行标使用 `GMT12345-2026` 形式，保留真实编号的前导零；注明作者、日期、资料来源和引用条款。
4. 在 `mkdocs.yml` 的 `nav` 中登记实际文件路径，保留其他章节和同事的条目。导航路径相对于 `docs/`，不加 `docs/` 前缀。
5. 完成严格构建，并实际启动 `mkdocs serve`，在浏览器检查导航、正文、图片、搜索与排版。
6. 使用 Git 提交文章、图片和配置，同步同事更新后推送个人分支，通过 Pull Request 合入 `main`，最后确认发布结果。

文章目录示例：

```text
docs/product/智能密码钥匙/文章名称/
├── 文章名称.md
└── assets/
    └── example.png
```

Markdown 图片引用：

```markdown
![图示](assets/example.png)
```

**Windows 注意：Markdown 图片路径和 YAML 导航路径统一使用 `/`，不能引用本机绝对路径或使用 `\`。** 图片放在文章自己的目录，网站公共的 `docs/assets/` 用于主题资源。

**每次 push 前必须实际完成 `serve` 检查。** 合并或冲突处理改变了内容时，重新检查最终版本。push 或发布失败时，先在协作群同步报错，保留本地文件与提交，再排查网络、权限和分支更新，不强制覆盖远端历史。

详细操作命令、文章模板和失败消息模板见[快速开始](docs/index.md)与[维护参考](docs/maintenance/维护参考/维护参考.md)。

## 构建与发布

在项目根目录检查在线版：

```powershell
Remove-Item Env:OFFLINE -ErrorAction SilentlyContinue
.\.venv\Scripts\python.exe -m mkdocs build --strict
```

构建离线版，并清除本终端的离线模式变量：

```powershell
$env:OFFLINE = "true"
.\.venv\Scripts\python.exe -m mkdocs build --strict --site-dir site-offline
Remove-Item Env:OFFLINE -ErrorAction SilentlyContinue
```

在线版输出到 `site/`，离线版输出到 `site-offline/`。离线版可用浏览器打开 `site-offline/index.html`；离线包包含公式渲染与搜索所需的本地资源。

[GitHub Actions 工作流](.github/workflows/docs.yml)负责检查与发布：

- 面向 `main` 的 Pull Request：检查在线版和离线版，不发布网站。
- 推送到 `main` 或手动触发工作流：检查成功后发布到 GitHub Pages，并保存离线构建包。
- 离线包在成功的 Actions 运行中下载，名称为 `crypto-assessment-wiki-offline`，保存 90 天。

个人分支 push 成功后，需要通过 PR 合入 `main` 才会触发日常发布流程。

## 主题与资源

网站样式基于 Blue Topaz Maple Typora 主题，保留浅深色配色、标题层级、表格、代码块和居中公式风格。

正文与代码优先使用本机安装的 **Maple Mono NF CN**，缺失时使用后备字体；仓库未附带该字体文件。KaTeX 脚本、数学字体及离线搜索兼容脚本保存在 `docs/assets/vendor/`，相应第三方许可证随资源保留。

配色、字体和资源位置说明见 [THEME.md](THEME.md)。
