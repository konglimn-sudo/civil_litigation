#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def run_tesseract(image_path):
    command = [
        os.environ.get("TESSERACT_BIN", "tesseract"),
        str(image_path),
        "stdout",
        "-l",
        "chi_sim+eng",
        "--psm",
        "6",
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Tesseract OCR failed")
    return result.stdout.strip()


def extract_pdf(file_path):
    import fitz

    document = fitz.open(file_path)
    text_parts = [page.get_text("text").strip() for page in document]
    text = "\n\n".join(part for part in text_parts if part)
    if len(text.strip()) >= 80:
        return text, "pdf-text", len(document), []

    warnings = []
    ocr_parts = []
    page_limit = min(len(document), 30)
    with tempfile.TemporaryDirectory(prefix="hengfa-ocr-") as temp_dir:
        for index in range(page_limit):
            page = document[index]
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image_path = Path(temp_dir) / f"page-{index + 1}.png"
            pixmap.save(image_path)
            page_text = run_tesseract(image_path)
            if page_text:
                ocr_parts.append(f"[第 {index + 1} 页]\n{page_text}")
    if len(document) > page_limit:
        warnings.append(f"扫描件超过 {page_limit} 页，仅处理前 {page_limit} 页")
    return "\n\n".join(ocr_parts), "pdf-ocr", len(document), warnings


def extract_docx(file_path):
    from docx import Document

    document = Document(file_path)
    parts = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
    for table in document.tables:
        for row in table.rows:
            values = [cell.text.strip() for cell in row.cells]
            if any(values):
                parts.append("\t".join(values))
    return "\n".join(parts), "docx-text", None, []


def extract_plain(file_path):
    raw = Path(file_path).read_bytes()
    for encoding in ("utf-8", "gb18030", "utf-16"):
        try:
            return raw.decode(encoding), f"plain-{encoding}", None, []
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace"), "plain-recovered", None, ["文本编码无法完整识别"]


def main():
    file_path = Path(sys.argv[1]).resolve()
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        text, method, pages, warnings = extract_pdf(file_path)
    elif suffix == ".docx":
        text, method, pages, warnings = extract_docx(file_path)
    elif suffix in {".txt", ".md", ".csv", ".json"}:
        text, method, pages, warnings = extract_plain(file_path)
    elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}:
        text, method, pages, warnings = run_tesseract(file_path), "image-ocr", 1, []
    else:
        raise RuntimeError(f"Unsupported file type: {suffix}")
    print(json.dumps({"text": text.strip(), "method": method, "pages": pages, "warnings": warnings}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        sys.exit(1)
