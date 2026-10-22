"""Build a local search worker with conservative automatic fallback matching."""

import hashlib
import json
import re
from pathlib import Path

from mkdocs.exceptions import PluginError
from mkdocs.plugins import event_priority


ROOT = Path(__file__).resolve().parent.parent
WORKERS = Path("assets/javascripts/workers")
CONFIG = re.compile(r'(<script\b[^>]*\bid="__config"[^>]*>)(.*?)(</script>)', re.S)
_sources = ()
_workers = {}


def on_config(config):
    global _sources
    _workers.clear()
    _sources = tuple(path.read_text(encoding="utf-8") for path in (
        ROOT / "hooks/search/worker-prefix.js",
        ROOT / "docs/assets/javascripts/search-policy.js",
        ROOT / "hooks/search/worker-suffix.js",
    ))
    return config


def rewrite_config(output):
    match = CONFIG.search(output)
    if not match:
        return output
    settings = json.loads(match[2])
    original = settings.get("search", "")
    filename = original.rsplit("/", 1)[-1]
    if filename in _workers:
        return output
    if not re.fullmatch(r"search\.[a-f0-9]+\.min\.js", filename):
        raise PluginError("The automatic search hook requires Material's built-in search worker")

    # Include the upstream version and all extensions in the filename to avoid
    # serving cached JavaScript after either the theme or our policy changes.
    digest = hashlib.sha256((filename + "\n" + "\n".join(_sources)).encode()).hexdigest()[:16]
    generated = f"search.{digest}.min.js"
    _workers[generated] = filename
    settings["search"] = original[:-len(filename)] + generated
    data = json.dumps(settings, ensure_ascii=False, separators=(",", ":"))
    data = data.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return output[:match.start(2)] + data + output[match.end(2):]


def on_post_page(output, *, page, config):
    return rewrite_config(output)


def on_post_template(output, *, template_name, config):
    # Error pages are built as theme templates, outside the normal page event.
    return rewrite_config(output)


@event_priority(-50)
def on_post_build(*, config):
    prefix, policy, suffix = _sources
    directory = Path(config.site_dir) / WORKERS
    for generated, original in _workers.items():
        source = directory / original
        if not source.is_file():
            raise PluginError(f"Material search worker is missing: {original}")
        # Keep the original implementation and its license. Combining it at
        # build time avoids an extra bootstrap import in offline iframe workers.
        content = "\n".join((prefix, source.read_text(encoding="utf-8"), policy, suffix))
        (directory / generated).write_text(content, encoding="utf-8")
