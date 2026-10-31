#!/usr/bin/env python3
"""Refresh Ping's three self-hosted OFL variable font subsets.

Run from the repository root with Python 3 and curl installed:
    python3 scripts/update-fonts.py

The script reads UI glyphs from i18n.ts and App.tsx, then adds the Chinese
probe and metric terms to the Google Fonts Noto Sans SC text subset. It writes
only public/fonts assets and src/fonts.css.
"""

from __future__ import annotations

import re
import subprocess
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = ROOT / "public" / "fonts"
FONT_CSS = ROOT / "src" / "fonts.css"
CHROME_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)

# Probe labels and summary words are intentionally included even before they
# appear in copy.zh; new visible Chinese copy is picked up automatically.
EXTRA_GLYPHS = "国内国外中国大陆中国网络服务电信联通移动腾讯字节百度哔哩哔哩微信淘宝延迟探针统计分位数带宽平均中值抖动稳定实时故障已连接请求状态检查刷新全部海外全球网速暂无数据分钟秒重试已确认数据测量时间范围分布概率计数变化告警等待在线离线中断恢复、，。！？：；（）"
FONT_SOURCES = (
    (
        "Inter",
        "inter-variable.woff2",
        "https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap",
        "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt",
    ),
    (
        "Noto Sans SC",
        "noto-variable.woff2",
        None,
        "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt",
    ),
    (
        "JetBrains Mono",
        "jetbrains-variable.woff2",
        "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400..700&display=swap",
        "https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt",
    ),
)


def download(url: str) -> bytes:
    """Use curl so the configured system proxy and CA bundle are respected."""
    result = subprocess.run(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--max-time",
            "60",
            "--user-agent",
            CHROME_UA,
            url,
        ],
        check=True,
        capture_output=True,
    )
    return result.stdout


def chinese_interface_glyphs() -> str:
    source = (ROOT / "src" / "lib" / "i18n.ts").read_text(encoding="utf-8")
    match = re.search(
        r"\bzh\s*:\s*\{(?P<body>.*?)\n\s*\},\s*\n\s*en\s*:",
        source,
        re.DOTALL,
    )
    if not match:
        raise RuntimeError("Could not find the zh locale block in src/lib/i18n.ts")

    app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
    interface_text = match.group("body") + app
    return "".join(sorted({character for character in interface_text if ord(character) > 255}))


def google_css(family: str, glyphs: str | None = None) -> tuple[str, str]:
    if glyphs is None:
        url = next(css_url for name, _, css_url, _ in FONT_SOURCES if name == family)
    else:
        url = (
            "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400..700"
            f"&text={urllib.parse.quote(glyphs, safe='')}&display=swap"
        )

    css = download(url).decode("utf-8")
    face_blocks = re.findall(r"@font-face\s*\{(.*?)\}", css, flags=re.DOTALL)
    for block in face_blocks:
        if f"font-family: '{family}'" not in block:
            continue
        source_match = re.search(r"url\((.*?)\)\s*format\(['\"]woff2['\"]\)", block)
        range_match = re.search(r"unicode-range:\s*(.*?);", block)
        if source_match and range_match:
            if glyphs is None and "U+0000-00FF" not in range_match.group(1):
                continue
            return source_match.group(1), range_match.group(1)

    raise RuntimeError(f"Google Fonts returned no WOFF2 subset for {family}")


def covered_codepoints(unicode_range: str) -> set[int]:
    covered: set[int] = set()
    for token in unicode_range.split(","):
        token = token.strip()
        if not token.startswith("U+"):
            raise RuntimeError(f"Unexpected unicode range token: {token}")
        bounds = token[2:].split("-")
        start = int(bounds[0], 16)
        end = int(bounds[-1], 16)
        covered.update(range(start, end + 1))
    return covered


def main() -> None:
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    glyphs = chinese_interface_glyphs()
    if not glyphs:
        raise RuntimeError("The Chinese locale did not contain any glyphs")

    faces: list[str] = [
        "/* Self-hosted OFL fonts; Noto Sans SC is subset to the current UI and probes. */"
    ]
    size_total = 0

    for family, filename, css_url, license_url in FONT_SOURCES:
        if family == "Noto Sans SC":
            source_url, unicode_range = google_css(family, glyphs + EXTRA_GLYPHS)
            requested = {ord(character) for character in glyphs + EXTRA_GLYPHS}
            missing = requested - covered_codepoints(unicode_range)
            if missing:
                chars = "".join(chr(codepoint) for codepoint in sorted(missing))
                raise RuntimeError(f"Noto Sans SC response omitted requested glyphs: {chars}")
        else:
            if css_url is None:
                raise RuntimeError(f"Missing stylesheet URL for {family}")
            source_url, unicode_range = google_css(family)

        font_data = download(source_url)
        font_path = FONTS_DIR / filename
        font_path.write_bytes(font_data)
        size_total += len(font_data)

        license_data = download(license_url)
        license_name = family.lower().replace(" ", "")
        (FONTS_DIR / f"OFL-{license_name}.txt").write_bytes(license_data)

        faces.append(
            "\n".join(
                [
                    "@font-face {",
                    f'  font-family: "{family}";',
                    "  font-style: normal;",
                    "  font-weight: 400 700;",
                    "  font-display: swap;",
                    f'  src: url("/fonts/{filename}") format("woff2");',
                    f"  unicode-range: {unicode_range};",
                    "}",
                ]
            )
        )
        print(f"{family}: wrote {filename} ({len(font_data):,} bytes)")

    FONT_CSS.write_text("\n\n".join(faces) + "\n", encoding="utf-8")
    print(f"Noto Sans SC requested glyphs: {len(set(glyphs + EXTRA_GLYPHS))}")
    print(f"Total WOFF2 size: {size_total:,} bytes")
    print(f"Wrote {FONT_CSS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
