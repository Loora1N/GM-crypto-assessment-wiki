# Blue Topaz Maple 网站主题

网站样式基于提供的 `blue-topaz-maple-final-math-centered.zip`，将 Typora 的浅色、深色主题适配到 Material for MkDocs。

- 浅色：冷白页面、蓝色标题、淡蓝侧栏。
- 深色：蓝黑页面、天蓝／淡紫／青绿／粉色／琥珀／薄荷色标题层级。
- 页眉右侧可以切换主题，首次访问跟随系统偏好。
- 桌面阅读布局为“左侧文章标题目录／正文”，页面最大宽度 1360px，标题目录随屏幕宽度在 260–300px 之间调整。右侧不再显示文章导航，文章通过顶部分类进入各分类首页选择。
- 顶部分类栏随页眉固定，滚动阅读时仍可切换分类；窄屏可横向滑动分类栏，通过左上角按钮展开当前文章的标题目录。
- 文章标题下方提供独立的「本文搜索」：随正文滚动固定，支持高亮、计数、上一处／下一处及清除，保留页眉全站搜索；浅深色、窄屏和离线版均可用，打印时隐藏搜索条和临时高亮。
- 右下角的“页顶／页底”按钮可平滑跳转到页面两端，支持键盘操作并跟随浅深色主题；开启系统减少动态效果时直接跳转。无需滚动的短页面和打印时隐藏。
- 屏幕阅读时，正文表格的外层滚动容器使用 `contain: paint` 限定绘制范围，降低长篇标准滚动时的开销。保留表格的实际高度及横向滚动，目录定位和本文搜索继续使用完整正文；打印不启用此规则。不要将该规则移到内层表格，否则宽表格可能被裁切。
- 正文、导航和代码优先使用本机安装的 Maple Mono NF CN，缺失时使用字体栈中的后备字体。主题包未提供字体文件，网站也没有外部字体请求。
- `ASN.1` 代码围栏映射到 Pygments 的 ASN.1 lexer，支持文档中使用 `ASN.1` 作为语言标记。
- 保留 Typora 的 `> [!note]` 等独立提示标记写法，显示时转换为对应提示块；同时支持 MkDocs 的 `!!! note`。
- `$...$` 为行内公式，`$$...$$` 为独立公式；独立公式居中显示。KaTeX 脚本、样式与数学字体保存在项目中，供在线版与离线版使用。
- 离线搜索使用的 iframe-worker 脚本也随项目保存，替代插件默认的外部脚本地址。

## 修改位置

- `mkdocs.yml`：主题切换、Markdown 扩展、资源引用。
- `overrides/main.html`：仅保留当前文章标题目录，复用主题的标题链接与定位功能。
- `docs/*/index.md`：各分类的文章入口；新增文章时同时更新分类首页链接与 `mkdocs.yml` 导航。
- `docs/assets/stylesheets/blue-topaz-maple.css`：配色变量、页面和文章样式。
- `docs/assets/javascripts/blue-topaz-maple.js`：提示块和公式显示。
- `docs/assets/javascripts/page-navigation.js`：页顶／页底辅助按钮与滚动状态。
- `docs/assets/javascripts/page-search.js` 与 `docs/assets/stylesheets/page-search.css`：文章内搜索、独立高亮及响应式搜索条。
- `docs/assets/vendor/katex/`：KaTeX 资源与许可证；版本记录在 `VERSION.txt`。
- `docs/assets/vendor/iframe-worker/`：离线搜索兼容脚本与许可证。

## 本地预览与检查

```powershell
.\.venv\Scripts\python.exe -m mkdocs serve
.\.venv\Scripts\python.exe -m mkdocs build --strict
$env:OFFLINE = "true"
.\.venv\Scripts\python.exe -m mkdocs build --strict --site-dir site-offline
Remove-Item Env:OFFLINE
```

原主题署名：Cyrus Cui，基于 WhyI & Pkmer 的 Blue Topaz for Obsidian，主题头部标注 MIT 许可证。网站适配保留了来源署名。
