# 密评标准知识库

基于 **MkDocs + Material for MkDocs** 搭建的密码学习与测评文档站点，用于整理标准条款、算法与协议笔记、密码产品资料和测评经验。

[在线知识库](https://loora1n.github.io/GM-crypto-assessment-wiki/) · [标准文章目录](docs/index.md) · [从 0 开始上传笔记](docs/maintenance/快速开始/快速开始.md) · [项目维护参考](docs/maintenance/维护参考/维护参考.md)

## 内容分类

通过顶部固定分类栏进入各分类首页，再从文章目录选择内容；阅读时左侧显示当前文章的标题目录。

| 章节 | 目录 | 内容示例 |
| --- | --- | --- |
| [密码算法](docs/algorithm/index.md) | `docs/algorithm/` | 对称密码算法、非对称密码算法、杂凑算法 |
| [密码协议](docs/protocol/index.md) | `docs/protocol/` | 安全传输协议、认证协议、密钥交换协议 |
| [密码产品](docs/product/index.md) | `docs/product/` | 智能密码钥匙、服务器密码机、密钥管理设备 |
| [密码测评](docs/assessment/index.md) | `docs/assessment/` | 测评基础、测评实施、案例与学习笔记 |
| [国标与行标](docs/standard/index.md) | `docs/standard/` | 项目已收录的国家标准与密码行业标准汇总 |
| [个人笔记](docs/notes/index.md) | `docs/notes/` | 按作者整理的学习记录与协议解析 |
| [使用手册](docs/maintenance/index.md) | `docs/maintenance/` | 使用、上传文章与维护说明 |

站点支持中文／英文搜索、浅色／深色切换、代码高亮与复制、提示块、数学公式和离线浏览。

## 搜索标准与算法标识

- 直接输入关键词即可：先搜索完整片段，再补充关键词、前缀和较长英文词的一字符拼写纠错，例如 `cryptograhpic` 可找到 `Cryptographic`。结果按“精准匹配／模糊匹配”分区，按页面与章节去重，精准命中优先保留，无需额外语法。
- 中文支持整词术语别名：消息鉴别码／消息认证码／MAC、杂凑／哈希／Hash。同义术语结果会补充在模糊匹配中，不覆盖精准结果。
- 模糊结果按“文章标题 → 分级小标题 → 正文 → 表格／公式／附录”排序，附录下的子标题也按附录处理。同类结果优先展示命中不同查询分词更多的结果；正文按单个文段的命中词数比较，重复出现同一词不重复计数，也不跨段累加，并预览命中最多的文段。同分小标题优先层级更高者，再参考相关度。
- 模糊结果去重后最多显示前 20 处，精准结果不受此限制。超出时会在列表末尾提示“模糊匹配结果总数xxx，数量较多只展示了xx”。模糊结果逐条显示，以免同篇文章的其他章节打乱全局排序。
- 中英文、数字相邻的片段无需手动加空格，例如 `gcm模式下ctr计数器`。含符号的原文也会先按字面精准检索，例如 `对c+s随机数`，无需转义加号。精准结果按完整片段高亮；中文排版空格、英文大小写和十六进制前缀写法会规范化，分属不同段落或表格单元格的内容不会拼成精准结果。
- 数值、十六进制、OID、标准编号、带数字的标识和短算法名称不做自动拼写纠错，避免把 `401` 变成 `402` 或把 `SM4` 变成其他算法。每个英文词最多容忍一次字符增删、替换或相邻字母交换。
- 搜索 `401`、`0x401` 或 `0x00000401`，可找到 GMT0006-2023 的 **6.2.1 分组密码算法标识**，其中包含 `SGD_SM4_ECB`。十六进制值会忽略 `0x` 前缀和其后的前导零，大小写不影响搜索；中间的零仍然保留。
- 搜索 `0006` 或 `GMT0006` 可查找标准；搜索 `SGD_SM4`、`SM4`、`ECB` 可查找算法标识及其组成部分。点分 OID（如 `1.2.156.10197.1.104.1`）作为完整词保留。
- 多个词默认匹配任一词。需要同时包含所有词时，使用引号，例如 `"SGD_SM4_ECB"` 或 `"SM4 ECB"`；这表示同时包含各词，不要求它们相邻。
- 裸补零值（如 `00000401`）请加上 `0x`，或去掉前导零后搜索 `401`。中文支持正文片段检索；英文和数值保留词边界，前缀命中会列入模糊匹配。
- 同一篇文章的其他命中章节可能折叠在“在该页上还有 … 个符合条件的结果”中，展开后可直接跳转到相应条款。用 `"401"` 可限定完整词，排除 `40100` 这类前缀匹配。
- 表格命中结果保留表头、行列和高亮，预览区域可滚动，打开结果时会定位到首个命中行。点击结果可进入正文查看完整内容。

修改文档或搜索配置后须重新构建；离线使用时也要更新整个离线包，旧包不会自动更新索引。

## 在文章内搜索

先用页眉的全站搜索找到标准，再使用文章标题下方独立的「本文搜索」查找当前文章中的关键词、条款号或算法名称。搜索条滚动时保持可用，正文、标题、表格和代码中的命中会高亮，并显示当前序号和总数。

- 点击「上一处／下一处」，或在输入框中按 `Enter`／`Shift+Enter`，循环切换命中位置。
- 点击「清除」或按 `Esc` 清除本文搜索；全站搜索及其结果保持独立。
- 支持中文、英文大小写及全半角匹配；符号按原文查找，不使用正则或全站搜索的模糊匹配语法。短语不会跨段落或表格单元格拼接。
- 折叠说明中的命中会自动展开。在线版与离线版均可使用。

## 本地运行

### Windows / macOS 一键启动

安装 **Python 3.12**，完整下载并解压项目后，按系统双击根目录的启动脚本即可。无需手动输入启动命令。

| 系统 | 启动脚本 | 准备工作 |
| --- | --- | --- |
| Windows | [`run-windows.bat`](run-windows.bat) | 安装 Python 时勾选 **Add python.exe to PATH** |
| macOS | [`run-macos.command`](run-macos.command) | 安装 macOS 版 Python；脚本支持查找 Python.org 和 Homebrew 的常见安装位置 |

- 首次启动会自动创建 `.venv` 并安装依赖，需要联网；以后会复用环境，只补装缺失或不满足版本要求的依赖。
- 页面生成后会自动打开默认浏览器。请保留启动窗口，关闭窗口即可停止服务；保存文章后页面会自动更新。
- 启动失败时窗口会保留错误信息。如果提示端口 `8000` 被占用，请关闭之前打开的启动窗口后重试。
- Windows 和 macOS 的 `.venv` 不能共用。跨系统复制项目时不要携带 `.venv`，让脚本在当前系统重新创建环境。

macOS 脚本在 Git 中保留执行权限。如果复制或解压后提示没有执行权限，可在终端输入 `chmod +x `（末尾留一个空格），将 `run-macos.command` 拖入终端并按回车，再重新双击脚本。

### 使用命令启动

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

第一次安装工具、配置 Git 或上传笔记，请按[快速开始](docs/maintenance/快速开始/快速开始.md)逐步操作。

## 项目结构

```text
GM-crypto-assessment-wiki/
├── README.md                    # 仓库介绍与启动入口
├── run-windows.bat              # Windows 双击启动本地预览
├── run-macos.command            # macOS 双击启动本地预览
├── mkdocs.yml                   # 网站配置、导航和 Markdown 扩展
├── requirements.txt             # Python 依赖
├── THEME.md                     # Blue Topaz Maple 主题说明
├── docs/
│   ├── index.md                 # 国标与行标文章目录：首页
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
4. 在 `mkdocs.yml` 的 `nav` 中登记实际文件路径，并将文章链接加入对应分类的 `index.md`，保留其他章节和同事的条目。导航路径相对于 `docs/`，不加 `docs/` 前缀。
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

详细操作命令、文章模板和失败消息模板见[快速开始](docs/maintenance/快速开始/快速开始.md)与[维护参考](docs/maintenance/维护参考/维护参考.md)。

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

搜索回归检查需要 **Node.js 22 或更新版本**。在上述两次构建后执行：

```powershell
node tests/search.test.cjs site
node tests/search.test.cjs site-offline --offline
node --test tests/page-search.test.cjs
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_search_tables.py -v
```

检查直接运行构建产物中的 Material 搜索 worker，验证标识值、标准编号、算法名称、中文、OID、结果章节和高亮，以及离线索引与本地搜索资源。仅构建成功不能保证检索结果正确。浏览器验收时，搜索 `401` 并打开 **6.2.1 分组密码算法标识**，核对 `SGD_SM4_ECB` 对应的 `0x00000401`。

表格预览由 `hooks/search_tables.py` 保留索引中的表格结构，`docs/assets/javascripts/search-tables.js` 控制预览滚动；未修改安装目录中的主题文件。该钩子扩展 Material 9 的搜索索引接口，升级主题时须同时通过上述索引与搜索检查，并在浏览器核对表格预览。

完整片段检索位于 `hooks/search/worker-literal.js`，自动匹配策略和术语别名位于 `docs/assets/javascripts/search-policy.js`。`hooks/search_tables.py` 在索引中记录文段、表格、公式和附录，`hooks/search/worker-ranking.js` 负责模糊结果排序及展示上限。`hooks/search_fuzzy.py` 将搜索脚本与 Material 的原搜索 worker 合并为带内容哈希的新产物，在线版和离线版使用同一逻辑；`search-notice.js` 显示精准／模糊分区、去重计数和匹配类型。搜索保留英文原词，避免词干处理与前缀匹配组合导致正确拼写漏检。维护搜索时还应检查精准与模糊结果并集、跨阶段去重、技术值不串配、连续输入和目标页高亮。

[GitHub Actions 工作流](.github/workflows/docs.yml)负责检查与发布：

- 面向 `main` 的 Pull Request：检查在线版和离线版的构建与搜索，不发布网站。
- 推送到 `main` 或手动触发工作流：检查成功后发布到 GitHub Pages，并保存离线构建包。
- 离线包在成功的 Actions 运行中下载，名称为 `crypto-assessment-wiki-offline`，保存 90 天。

个人分支 push 成功后，需要通过 PR 合入 `main` 才会触发日常发布流程。

## 主题与资源

网站样式基于 Blue Topaz Maple Typora 主题，保留浅深色配色、标题层级、表格、代码块和居中公式风格。

正文与代码优先使用本机安装的 **Maple Mono NF CN**，缺失时使用后备字体；仓库未附带该字体文件。KaTeX 脚本、数学字体及离线搜索兼容脚本保存在 `docs/assets/vendor/`，相应第三方许可证随资源保留。

配色、字体和资源位置说明见 [THEME.md](THEME.md)。
