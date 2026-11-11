"""Download names never determine internal storage paths."""

import re


def download_name(original: str, extension: str) -> str:
    basename = original.replace("\\", "/").rsplit("/", 1)[-1]
    stem = basename.rsplit(".", 1)[0] if "." in basename else basename
    stem = re.sub(r'[<>:"/\\|?*\x00-\x1f\x7f]', "_", stem).strip(" .")[:180].rstrip(" .")
    return f"{stem or 'filecraft'}.{extension}"
