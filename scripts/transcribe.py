#!/usr/bin/env python3
"""可选庭审语音转写加速器（本地离线，数据不出本机）。

依赖 faster-whisper（pip install faster-whisper）。未安装时输出 JSON 错误，
由 transcribe.mjs 捕获并回退到「手工导入笔录」。模型与语言可经环境变量覆盖：
  HENGFA_ASR_MODEL  默认 small（可选 tiny/base/small/medium/large-v3）
  HENGFA_ASR_LANG   默认 zh
首次运行会按需下载模型到本机缓存；之后完全离线。
"""
import json
import os
import sys


def main():
    if len(sys.argv) < 2:                                  # 必须传入音频路径
        print(json.dumps({"error": "缺少音频文件路径"}, ensure_ascii=False))
        return
    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):                     # 路径无效直接报错
        print(json.dumps({"error": "音频文件不存在"}, ensure_ascii=False))
        return
    try:
        from faster_whisper import WhisperModel            # 延迟导入:未安装时给出明确提示由 Node 端回退
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"faster-whisper 未安装：{exc}"}, ensure_ascii=False))
        return

    model_size = os.environ.get("HENGFA_ASR_MODEL", "small")  # 模型规格(可环境变量覆盖)
    language = os.environ.get("HENGFA_ASR_LANG", "zh")        # 识别语言,默认中文
    try:
        # CPU + int8 量化:无 GPU 也能跑,内存占用更低。
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        # vad_filter:用语音活动检测剔除静音段,减少幻听。
        segments, info = model.transcribe(audio_path, language=language, vad_filter=True)
        seg_list = []   # 带时间戳的分段
        texts = []      # 纯文本(按段落拼接)
        for seg in segments:
            text = (seg.text or "").strip()
            if not text:
                continue                                   # 跳过空段
            seg_list.append({"start": round(float(seg.start), 2), "end": round(float(seg.end), 2), "text": text})
            texts.append(text)
        # 统一输出 JSON,供 transcribe.mjs 解析。
        print(json.dumps({
            "text": "\n".join(texts),
            "segments": seg_list,
            "method": "faster-whisper",
            "language": getattr(info, "language", language)  # 模型回报的识别语言
        }, ensure_ascii=False))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))  # 运行期异常转 JSON 错误


if __name__ == "__main__":
    main()
