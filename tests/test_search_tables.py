"""Regression checks for the table-aware Material search index hook."""

import json
import unittest
from html.parser import HTMLParser
from pathlib import Path
from types import SimpleNamespace

from material.plugins.search.plugin import SearchIndex, SearchPlugin
from mkdocs.config import load_config

from hooks.search_tables import TableSearchIndex, on_config


class TableStructure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.rows.append([])
        if tag in {"td", "th"}:
            self.rows[-1].append("")
        self.stack.append(tag)

    def handle_endtag(self, tag):
        assert self.stack.pop() == tag, "Search table tags must stay balanced"

    def handle_data(self, data):
        if self.stack and self.stack[-1] in {"td", "th"}:
            self.rows[-1][-1] += data


def page(content, **meta):
    return SimpleNamespace(content=content, meta=meta, title="Page", url="page/", toc=[])


def index_page(content, **meta):
    index = TableSearchIndex()
    index.add_entry_from_context(page(content, **meta))
    return index


class SearchTableTests(unittest.TestCase):
    def test_ranking_metadata_distinguishes_paragraphs_tables_and_formulas(self):
        entry = index_page(
            '<h1 id="page">Page</h1><p>alpha <code>beta</code></p><p>gamma</p>'
            '<table><tr><td>tableword</td></tr></table>'
            '<div class="arithmatex">\\[formula\\]</div>'
            '<p>before <span class="arithmatex">\\(inlineformula\\)</span> after</p>'
        ).entries[0]
        meta = entry["searchMeta"]
        self.assertEqual(meta["headingLevel"], 1)
        self.assertFalse(meta["appendix"])
        self.assertEqual([(block["kind"], block["text"]) for block in meta["blocks"]], [
            ("body", "alpha beta"), ("body", "gamma"), ("table", "tableword"),
            ("formula", "\\[formula\\]"), ("body", "before   after"),
            ("formula", "\\(inlineformula\\)"),
        ])

    def test_appendix_applies_to_descendants_but_not_later_sibling_sections(self):
        entries = index_page(
            '<h1 id="page">Page</h1><h2 id="appendix">附录 A</h2>'
            '<h3 id="child">A.1 Nested</h3><p>inside</p>'
            '<h4 id="grandchild">Details</h4><p>inside too</p>'
            '<h2 id="normal">Normal</h2><p>outside</p>'
            '<h2 id="english">Annex B</h2><h3 id="english-child">B.1 Example</h3>'
        ).entries
        self.assertEqual([entry["searchMeta"]["appendix"] for entry in entries],
                         [False, True, True, True, False, True, True])

    def test_many_paragraphs_keep_separate_identities(self):
        paragraphs = [f"passage-{i}" for i in range(128)]
        entry = index_page('<h1 id="page">Page</h1>' +
                           "".join(f"<p>{text}</p>" for text in paragraphs)).entries[0]
        self.assertEqual([block["text"] for block in entry["searchMeta"]["blocks"]], paragraphs)

    def test_table_structure_and_section_destination(self):
        index = index_page(
            '<h1 id="page">Page</h1><h2 id="identifiers">Identifiers</h2>'
            '<table><thead><tr><th>Macro</th><th>Value</th></tr></thead>'
            '<tbody><tr><td>SGD_SM4_ECB</td><td>0x00000401</td></tr>'
            '<tr><td>SGD_SM4_CBC</td><td>0x00000402</td></tr></tbody></table>'
        )
        entry = index.entries[1]
        self.assertEqual(entry["location"], "page/#identifiers")
        parser = TableStructure()
        parser.feed(entry["text"])
        self.assertEqual(parser.stack, [])
        self.assertEqual(parser.rows, [
            ["Macro", "Value"],
            ["SGD_SM4_ECB", "0x00000401"],
            ["SGD_SM4_CBC", "0x00000402"],
        ])
        self.assertIn("<thead>", entry["text"])
        self.assertIn("<tbody>", entry["text"])

    def test_excluded_tables_rows_cells_and_sections(self):
        index = index_page(
            '<h1 id="page">Page</h1>'
            '<table data-search-exclude><tr><td>HIDDEN_TABLE</td></tr></table>'
            '<table><tr data-search-exclude><td>HIDDEN_ROW</td></tr>'
            '<tr><td data-search-exclude>HIDDEN_CELL</td><td>visible</td></tr></table>'
            '<h2 id="hidden" data-search-exclude>Hidden</h2>'
            '<table><tr><td>HIDDEN_SECTION</td></tr></table>'
            '<h2 id="next">Next</h2><p>next visible</p>'
        )
        text = "".join(entry["text"] for entry in index.entries)
        self.assertNotIn("HIDDEN", text)
        self.assertIn("<td>visible</td>", text)
        self.assertIn("next visible", text)
        self.assertFalse(any(entry["location"].endswith("#hidden") for entry in index.entries))
        self.assertNotIn("HIDDEN", json.dumps([entry["searchMeta"] for entry in index.entries]))

    def test_page_exclusion(self):
        index = index_page('<table><tr><td>hidden</td></tr></table>', search={"exclude": True})
        self.assertEqual(index.entries, [])

    def test_text_is_escaped_and_unsafe_markup_is_omitted(self):
        index = index_page(
            '<table><tr><td>&lt;img src=x onerror=alert(1)&gt; &amp; safe'
            '<script>HIDDEN_SCRIPT</script><style>HIDDEN_STYLE</style>'
            '<img src="x" onerror="alert(1)"></td></tr></table>'
        )
        text = index.entries[0]["text"]
        self.assertIn("&lt;img src=x onerror=alert(1)&gt; &amp; safe", text)
        self.assertNotIn("<img", text)
        self.assertNotIn("HIDDEN", text)
        self.assertNotIn("onerror=\"", text)
        self.assertNotIn("HIDDEN", json.dumps(index.entries[0]["searchMeta"]))

    def test_metadata_uses_material_entry_creation(self):
        index = index_page(
            '<table><tr><td>SM4</td></tr></table>',
            title="Custom title", tags=["crypto", 6, None], search={"boost": 2},
        )
        self.assertEqual(index.entries[0]["title"], "Custom title")
        self.assertEqual(index.entries[0]["tags"], ["crypto", "6"])
        self.assertEqual(index.entries[0]["boost"], 2)

    def test_hook_preserves_dirty_build_merge(self):
        plugin = SearchPlugin()
        plugin.load_config({})
        settings = {"lang": ["en"], "separator": r"\s+", "pipeline": [], "fields": {}}
        plugin.search_index = SearchIndex(**settings)
        previous = TableSearchIndex(**settings)
        previous.entries = [
            {"location": "page/", "title": "Old", "text": "old"},
            {"location": "page/#removed", "title": "Removed", "text": "old"},
            {"location": "other/", "title": "Other", "text": "keep"},
        ]
        plugin.search_index_prev = previous
        config = SimpleNamespace(plugins={"search": plugin})
        self.assertIs(on_config(config), config)
        self.assertIsInstance(plugin.search_index, TableSearchIndex)
        self.assertIs(plugin.search_index_prev, previous)
        plugin.search_index.add_entry_from_context(page('<table><tr><td>new</td></tr></table>'))
        result = json.loads(plugin.search_index.generate_search_index(plugin.search_index_prev))
        self.assertEqual(result["config"], settings)
        self.assertEqual([entry["location"] for entry in result["docs"]], ["other/", "page/"])
        self.assertIn("<table>", result["docs"][1]["text"])

    def test_disabled_search_is_unchanged(self):
        plugin = SearchPlugin()
        plugin.load_config({"enabled": False})
        config = SimpleNamespace(plugins={"search": plugin})
        self.assertIs(on_config(config), config)
        self.assertFalse(hasattr(plugin, "search_index"))

    def test_real_project_config_installs_hook_for_namespaced_search(self):
        config = load_config(str(Path(__file__).resolve().parents[1] / "mkdocs.yml"))
        config = config.plugins.on_config(config)
        search = config.plugins["material/search"]
        self.assertIsInstance(search, SearchPlugin)
        sample = page(
            '<h1 id="page">Page</h1><table><thead><tr><th>Macro</th><th>Value</th>'
            '</tr></thead><tbody><tr><td>SGD_SM4_ECB</td><td>0x00000401</td></tr>'
            '<tr data-search-exclude><td>HIDDEN</td><td>hidden</td></tr></tbody></table>'
        )
        config.plugins.on_page_context({}, page=sample, config=config, nav=[])
        text = search.search_index.entries[0]["text"]
        self.assertIn("<table>", text, "The configured hook must extend the real search plugin")
        self.assertIn("<td>SGD_SM4_ECB</td><td>0x00000401</td>", text)
        self.assertNotIn("HIDDEN", text)


if __name__ == "__main__":
    unittest.main()
