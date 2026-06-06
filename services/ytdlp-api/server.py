"""
Minimal yt-dlp download API for VANDOR (deploy on Railway/VPS, not Vercel).

GET /health
GET /download?url=...&format=audio|video
Header: Authorization: Bearer <YTDLP_API_KEY>  (optional if API_KEY env unset)
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import yt_dlp
from flask import Flask, Response, jsonify, request

app = Flask(__name__)

API_KEY = os.environ.get("API_KEY", "").strip()
MAX_BYTES = int(os.environ.get("MAX_BYTES", str(80 * 1024 * 1024)))


def check_auth() -> Response | None:
    if not API_KEY:
        return None
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if token != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    return None


def ydl_opts(fmt: str, outtmpl: str) -> dict:
    if fmt == "audio":
        return {
            "format": "bestaudio/best",
            "outtmpl": outtmpl,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "128",
                }
            ],
        }
    return {
        "format": "best[height<=720][ext=mp4]/best[ext=mp4]/best",
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "merge_output_format": "mp4",
    }


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "vandor-ytdlp-api"})


@app.get("/download")
def download():
    denied = check_auth()
    if denied:
        return denied

    url = request.args.get("url", "").strip()
    fmt = request.args.get("format", "video").strip().lower()
    if not url:
        return jsonify({"error": "Missing url parameter"}), 400
    if fmt not in ("audio", "video"):
        return jsonify({"error": "format must be audio or video"}), 400

    with tempfile.TemporaryDirectory() as tmp:
        outtmpl = str(Path(tmp) / "%(title).80B.%(ext)s")
        opts = ydl_opts(fmt, outtmpl)
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                if not info:
                    return jsonify({"error": "Could not extract video info"}), 502
                title = (info.get("title") or "download")[:120]
                filepath = Path(ydl.prepare_filename(info))
                if fmt == "audio" and filepath.suffix.lower() not in (".mp3", ".m4a"):
                    mp3 = filepath.with_suffix(".mp3")
                    if mp3.exists():
                        filepath = mp3
                if not filepath.exists():
                    candidates = list(Path(tmp).glob("*"))
                    if not candidates:
                        return jsonify({"error": "Download produced no file"}), 502
                    filepath = candidates[0]
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": str(exc)[:500]}), 502

        size = filepath.stat().st_size
        if size > MAX_BYTES:
            return jsonify({"error": f"File too large ({size} bytes)"}), 413
        if size < 1024:
            return jsonify({"error": "Downloaded file is empty"}), 502

        data = filepath.read_bytes()
        ext = filepath.suffix.lstrip(".") or ("mp3" if fmt == "audio" else "mp4")
        mime = "audio/mpeg" if ext == "mp3" else "video/mp4"
        if ext == "m4a":
            mime = "audio/mp4"

        headers = {
            "Content-Type": mime,
            "Content-Length": str(size),
            "X-Vandor-Title": title.encode("ascii", "ignore").decode() or "download",
            "X-Vandor-Filename": f"{title[:60]}.{ext}".encode("ascii", "ignore").decode(),
        }
        return Response(data, headers=headers)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
