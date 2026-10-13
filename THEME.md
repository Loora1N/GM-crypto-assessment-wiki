# Blue Topaz Maple 网站主题

网站样式基于提供的 `blue-topaz-maple-final-math-centered.zip`，将 Typora 的浅色、深色主题适配到 Material for MkDocs。

- 浅色：冷白页面、蓝色标题、淡蓝侧栏。
- 深色：蓝黑页面、天蓝／淡紫／青绿／粉色／琥珀／薄荷色标题层级。
- 页眉右侧可以切换主题，首次访问跟随系统偏好。
- 正文、导航和代码优先使用本机安装的 Maple Mono NF CN，缺失时使用字体栈中的后备字体。主题包未提供字体文件，网站也没有外部字体请求。
- 保留 Typora 的 `> [!note]` 等独立提示标记写法，显示时转换为对应提示块；同时支持 MkDocs 的 `!!! note`。
- `$...$` 为行内公式，`$$...$$` 为独立公式；独立公式居中显示。KaTeX 脚本、样式与数学字体保存在项目中，供在线版与离线版使用。
- 离线搜索使用的 iframe-worker 脚本也随项目保存，替代插件默认的外部脚本地址。

## 修改位置

- `mkdocs.yml`：主题切换、Markdown 扩展、资源引用。
- `docs/assets/stylesheets/blue-topaz-maple.css`：配色变量、页面和文章样式。
- `docs/assets/javascripts/blue-topaz-maple.js`：提示块和公式显示。
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
