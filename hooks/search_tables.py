"""Keep rendered Markdown tables in Material's search result previews."""

from material.plugins.search.plugin import Parser, SearchIndex, SearchPlugin
from mkdocs.plugins import event_priority


class TableParser(Parser):
    def __init__(self):
        super().__init__()
        # Material already renders safe HTML snippets and highlights their text.
        # Extend its allowlist instead of copying raw page HTML into the index.
        self.keep.update({"table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td"})


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
        for section in parser.data:
            if not section.is_excluded():
                self.create_entry_for_section(section, page.toc, page.url, page)


@event_priority(-50)
def on_config(config):
    """Install after Material initializes its index on each build."""
    # MkDocs may namespace theme plugins as "material/search" even when the
    # YAML uses "search", so identify Material's implementation by its type.
    for search in config.plugins.values():
        if isinstance(search, SearchPlugin) and search.config.enabled:
            search.search_index = TableSearchIndex(**search.search_index.config)
    return config
