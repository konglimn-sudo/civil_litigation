#!/usr/bin/env python3
"""可选稠密语义向量加速器（本地离线，数据不出本机）。

依赖 sentence-transformers（pip install sentence-transformers）。未安装时 embedding.mjs
的探测不会调用本脚本，自动回退到零依赖的本地概念向量。

约定：stdin 收一个 JSON 文本数组，stdout 输出等长的 JSON 向量数组（number[][]）。
模型可经 --model 或 HENGFA_EMBED_MODEL 覆盖，默认中文句向量模型；首次运行按需下载到本机缓存，之后离线。
"""
import json
import os
import sys


def main():
    model_name = os.environ.get("HENGFA_EMBED_MODEL", "shibing624/text2vec-base-chinese")
    if "--model" in sys.argv:                               # 命令行 --model 优先
        idx = sys.argv.index("--model")
        if idx + 1 < len(sys.argv):
            model_name = sys.argv[idx + 1]
    try:
        texts = json.loads(sys.stdin.read() or "[]")
        if not isinstance(texts, list):
            raise ValueError("输入需为 JSON 文本数组")
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"输入解析失败：{exc}"}, ensure_ascii=False))
        sys.exit(2)
    try:
        from sentence_transformers import SentenceTransformer  # 延迟导入：未安装时退出码非 0，由 Node 端回退
    except Exception:  # noqa: BLE001
        sys.exit(3)
    model = SentenceTransformer(model_name)
    vectors = model.encode([str(t) for t in texts], normalize_embeddings=True)
    json.dump([[float(x) for x in row] for row in vectors], sys.stdout)


if __name__ == "__main__":
    main()
