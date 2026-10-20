"""Build the shareable spec page (HTML) from docs/backend-spec.md."""
import re
import sys
import html
import markdown

src, out = sys.argv[1], sys.argv[2]
md_text = open(src, encoding="utf-8").read()

# Drop the H1 and the version table at the top; the page header renders them.
body_md = md_text.split("\n---\n", 1)[1] if "\n---\n" in md_text else md_text

# Python-Markdown needs 4-space nesting and a blank line before a list;
# the spec uses 2-space nesting, and some tables are indented under list items.
list_re = re.compile(r"^(\s*)([-*]|\d+\.)\s")
lines, out_lines, in_code = body_md.split("\n"), [], False
for line in lines:
    if line.lstrip().startswith("```"):
        in_code = not in_code
        out_lines.append(line.strip() if not line.startswith("  ") or True else line)
        continue
    if in_code:
        out_lines.append(line)
        continue
    stripped = line.lstrip(" ")
    indent = len(line) - len(stripped)
    if stripped.startswith("|") and indent:
        if out_lines and out_lines[-1].strip() and not out_lines[-1].lstrip().startswith("|"):
            out_lines.append("")
        out_lines.append(stripped)
        continue
    m = list_re.match(line)
    if m:
        line = " " * (indent * 2) + stripped
        prev = out_lines[-1] if out_lines else ""
        if prev.strip() and not list_re.match(prev) and not prev.startswith(" "):
            out_lines.append("")
    elif indent and stripped:
        line = " " * (indent * 2) + stripped
    out_lines.append(line)
body_md = "\n".join(out_lines)

# Image path: published next to the page.
body_md = body_md.replace("![系統架構圖](架構圖/architecture-v0.4.svg)", "![系統架構圖](architecture-v0.4.png)")

md = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "sane_lists"],
                       extension_configs={"toc": {"toc_depth": "2-3", "slugify": lambda v, s: "s-" + re.sub(r"[^0-9a-zA-Z]+", "-", v).strip("-").lower() or "s"}})
body_html = md.convert(body_md)

# Unique, ASCII-only heading ids so #anchors work.
counter = {"n": 0}
toc_items = []
def fix_heading(m):
    level, attrs, inner = m.group(1), m.group(2), m.group(3)
    counter["n"] += 1
    hid = f"h{counter['n']}"
    text = re.sub("<[^>]+>", "", inner)
    if level == "2":
        toc_items.append((hid, html.unescape(text)))
    return f'<h{level} id="{hid}">{inner}</h{level}>'
body_html = re.sub(r'<h([234])([^>]*)>(.*?)</h\1>', fix_heading, body_html)

# Status chips for the spec's markers.
chips = {
    "【預設，待確認】": '<span class="chip chip-default">預設・待確認</span>',
    "【預設，比 30 天提早】": '<span class="chip chip-default">預設</span>（比 30 天提早）',
    "【預設，依場次數排序】": '<span class="chip chip-default">預設</span>（依場次數排序）',
    "【預設，依步行距離排序】": '<span class="chip chip-default">預設</span>（依步行距離排序）',
    "【預設】": '<span class="chip chip-default">預設</span>',
    "【待提供】": '<span class="chip chip-todo">待提供</span>',
    "【實作前確認】": '<span class="chip chip-verify">實作前確認</span>',
}
for k, v in chips.items():
    body_html = body_html.replace(k, v)
body_html = re.sub(r"【實作前確認：([^】]+)】", r'<span class="chip chip-verify">實作前確認</span>（\1）', body_html)
body_html = body_html.replace("✅", '<span class="chip chip-done">已提供</span>').replace("⏳", '<span class="chip chip-todo">待確認</span>')

# Wide content scrolls inside its own box.
body_html = body_html.replace("<table>", '<div class="scroll"><table>').replace("</table>", "</table></div>")
body_html = re.sub(r"<pre>", '<pre class="code">', body_html)

counts = {
    "default": body_md.count("【預設"),
    "todo": body_md.count("【待提供】") + body_md.count("⏳"),
    "verify": body_md.count("【實作前確認"),
}

meta = {}
for key in ("版本", "日期", "狀態"):
    m = re.search(rf"\|\s*{key}\s*\|\s*(.+?)\s*\|", md_text)
    meta[key] = m.group(1) if m else ""
version_short = meta["版本"].split("（")[0]

toc_html = "\n".join(f'<li><a href="#{hid}">{html.escape(t)}</a></li>' for hid, t in toc_items)

template = open(sys.argv[3], encoding="utf-8").read()
page = (template
        .replace("{{VERSION}}", html.escape(version_short))
        .replace("{{VERSION_NOTE}}", html.escape(meta["版本"]))
        .replace("{{DATE}}", html.escape(meta["日期"]))
        .replace("{{TOC}}", toc_html)
        .replace("{{BODY}}", body_html)
        .replace("{{N_DEFAULT}}", str(counts["default"]))
        .replace("{{N_TODO}}", str(counts["todo"]))
        .replace("{{N_VERIFY}}", str(counts["verify"])))
open(out, "w", encoding="utf-8").write(page)
print("written", out, "toc", len(toc_items), counts)
