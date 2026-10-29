"""Keep safe table previews and content types for search ranking."""

import re
from html import unescape

from material.plugins.search.plugin import Parser, SearchIndex, SearchPlugin
from mkdocs.plugins import event_priority


class TableParser(Parser):
    def __init__(self):
        super().__init__()
        # Material already renders safe HTML snippets and highlights their text.
        # Extend its allowlist instead of copying raw page HTML into the index.
        self.keep.update({"table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td"})

    def handle_data(self, data):
        super().handle_data(data)
        if (not self.section or self.skip.intersection(self.context)
                or self.section.el in self.context):
            return
        # Collect only text already accepted by Material's parser. In particular,
        # excluded content and scripts must never leak through ranking metadata.
        formula = next((el for el in self.context if el.tag == "math" or
                        "arithmatex" in (el.attrs.get("class") or "").split()), None)
        table = next((el for el in self.context if el.tag == "table"), None)
        kind = "formula" if formula else "table" if table else "body"
        block = formula or next((el for el in reversed(self.context)
                                 if el.tag in {"p", "li", "pre", "td", "th", "div", "blockquote"}), self.section)
        key = (id(block), kind)
        if not hasattr(self.section, "search_blocks"):
            self.section.search_blocks = {}
            self.section.search_block_key = None
        blocks = self.section.search_blocks
        if key not in blocks:
            # Retain the element until parsing finishes: otherwise Python may
            # reuse its id for a later paragraph and merge unrelated passages.
            blocks[key] = {"kind": kind, "parts": [], "element": block}
        elif self.section.search_block_key != key:
            blocks[key]["parts"].append(" ")
        blocks[key]["parts"].append(data)
        self.section.search_block_key = key


class TableSearchIndex(SearchIndex):
    def add_entry_from_context(self, page):
        # Match Material's indexing flow so page/section exclusions, metadata,
        # heading anchors and Chinese segmentation keep their normal behavior.
        search = page.meta.get("search") or {}
        if search.get("exclude"):
            return

        parser = TableParser()
        parser.feed(page.content)
        parser.close()
        headings = []
        for section in parser.data:
            level = int(section.el.tag[1]) if re.fullmatch(r"h[1-6]", section.el.tag) else 0
            title = unescape(re.sub(r"<[^>]*>", "", "".join(section.title))).strip()
            if level:
                while headings and headings[-1][0] >= level:
                    headings.pop()
            appendix = bool(re.match(r"^(?:附[录錄]|appendix\b|annex\b)", title, re.I))
            appendix = appendix or bool(headings and headings[-1][1])
            if level:
                headings.append((level, appendix))
            if not section.is_excluded():
                self.create_entry_for_section(section, page.toc, page.url, page)
                blocks = []
                for block in getattr(section, "search_blocks", {}).values():
                    text = "".join(block["parts"]).strip()
                    if text:
                        blocks.append({"kind": block["kind"], "text": self._segment_chinese(text)})
                self.entries[-1]["searchMeta"] = {
                    "headingLevel": level, "appendix": appendix, "blocks": blocks,
                }


@event_priority(-50)
def on_config(config):
    """Install after Material initializes its index on each build."""
    # MkDocs may namespace theme plugins as "material/search" even when the
    # YAML uses "search", so identify Material's implementation by its type.
    for search in config.plugins.values():
        if isinstance(search, SearchPlugin) and search.config.enabled:
            search.search_index = TableSearchIndex(**search.search_index.config)
    return config
