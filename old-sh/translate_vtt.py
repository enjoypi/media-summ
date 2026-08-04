#! /usr/bin/env python
import argparse
import codecs
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from concurrent.futures import as_completed
import time

from dotenv import load_dotenv
from openai import OpenAI


def setup_logging():
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.buffer)


def init_openai_client() -> OpenAI:
    # 加载本文件所在目录的 .env
    script_dir = Path(__file__).parent
    env_path = script_dir / ".env"
    load_dotenv(env_path, override=False)

    api_key = os.getenv("OPENAI_API_KEY")
    api_base = os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1"
    model = os.getenv("OPENAI_MODEL")

    # 自动补全 /v1 路径
    if api_base and not api_base.endswith("/v1"):
        api_base = api_base.rstrip("/") + "/v1"

    if not api_key:
        raise ValueError("请在.env 文件中设置 OPENAI_API_KEY")
    if not model:
        raise ValueError("请在.env 文件中设置 OPENAI_MODEL")

    # 调试输出
    key_masked = api_key[:8] + "****" + api_key[-4:] if len(api_key) > 12 else "****"
    print(f"[DEBUG] API 配置：", flush=True)
    print(f"  - URL: {api_base}", flush=True)
    print(f"  - KEY: {key_masked}", flush=True)
    print(f"  - MODEL: {model}", flush=True)

    client = OpenAI(api_key=api_key, base_url=api_base)

    # 简单测试 API 连接
    print(f"[DEBUG] 测试 API 连接...", flush=True)
    try:
        test_response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=5,
        )
        print(f"[DEBUG] API 响应类型：{type(test_response)}", flush=True)
        print(f"[DEBUG] API 响应内容：{repr(test_response)[:500]}", flush=True)
        if hasattr(test_response, 'choices'):
            print(f"[DEBUG] API 测试成功：{test_response.choices[0].message.content}", flush=True)
        else:
            print(f"[DEBUG] 警告：API 返回非标准格式", flush=True)
    except Exception as e:
        print(f"[DEBUG] API 测试失败：{type(e).__name__}: {e}", flush=True)
        raise

    return client, model


def find_vtt_files(root_dir: str) -> list[str]:
    vtt_files = [
        str(path)
        for path in Path(root_dir).rglob("*.vtt")
        if not path.name.endswith(".chs.vtt")
    ]
    return vtt_files


def parse_vtt_block(block: str) -> tuple[str, list[str], list[str]]:
    lines = block.strip().split("\n")
    if len(lines) < 2:
        return "", [], []

    index = lines[0] if lines[0].isdigit() else ""
    current_line = 1 if index else 0

    if current_line >= len(lines):
        return "", [], []

    timestamp = lines[current_line]
    if not re.match(
        r"\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}", timestamp
    ):
        return "", [], []

    text = lines[current_line + 1 :] or [""]
    return index, [timestamp], text


def parse_vtt(file_path: str) -> tuple[str, list[tuple[str, list[str], list[str]]]]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        blocks = content.split("\n\n")
        if len(blocks) < 2:
            raise ValueError("VTT 文件格式错误：未找到有效的字幕块")
        header = blocks[0]
        subtitle_blocks = []
        for block in blocks[1:]:
            index, timestamp, text = parse_vtt_block(block)
            if timestamp and text:
                subtitle_blocks.append((index, timestamp, text))
        return header, subtitle_blocks
    except Exception as e:
        raise ValueError(f"解析 VTT 文件时出错：{str(e)}")


def split_vtt_content(content: str, max_blocks: int = 50, overlap_blocks: int = 10) -> list[str]:
    """将 VTT 内容分成多个小块，每块最多包含指定数量的字幕块，并且每块包含前一块的部分重叠"""
    if not content.endswith("\n"):
        content += "\n"

    blocks = content.split("\n\n")
    if len(blocks) < 2:
        return [content]

    header = blocks[0]
    subtitle_blocks = blocks[1:]
    total_blocks = len(subtitle_blocks)

    chunks = []
    start_idx = 0

    while start_idx < total_blocks:
        # 计算当前块的结束位置
        end_idx = min(start_idx + max_blocks, total_blocks)

        # 如果不是第一块，则包含前一块的最后 overlap_blocks 个字幕
        if start_idx > 0:
            overlap_start = max(0, start_idx - overlap_blocks)
            chunk_blocks = subtitle_blocks[overlap_start:end_idx]
        else:
            chunk_blocks = subtitle_blocks[start_idx:end_idx]

        chunk = header + "\n\n" + "\n\n".join(chunk_blocks)
        if not chunk.endswith("\n"):
            chunk += "\n"
        chunks.append(chunk)

        # 移动到下一块的起始位置
        start_idx = end_idx

        if start_idx >= total_blocks:
            break

    print(f"分块详情：", flush=True)
    for i, chunk in enumerate(chunks):
        block_count = len(chunk.split("\n\n")) - 1
        overlap_info = f"(包含 {overlap_blocks} 个重叠字幕)" if i > 0 else ""
        print(f"- 第 {i + 1} 块：{block_count} 个字幕{overlap_info}", flush=True)

    return chunks


def translate_vtt_chunk(chunk: str, client: OpenAI, model: str, stream: bool = False, max_retries: int = 1) -> str:
    """翻译单个 VTT 块，失败即停止"""
    retry_count = 0
    last_error = None

    while retry_count < max_retries:
        try:
            blocks = chunk.split("\n\n")
            header = blocks[0]
            subtitle_blocks = blocks[1:]
            original_blocks_count = len(subtitle_blocks)

            marked_blocks = []
            for i, block in enumerate(subtitle_blocks):
                marked_blocks.append(f"[BLOCK_{i}]\n{block}\n[/BLOCK_{i}]")

            marked_content = header + "\n\n" + "\n\n".join(marked_blocks)

            system_prompt = """你是一位资深的人力资源领域专家、人工智能领域专家、双语专家和字幕翻译员。

翻译要求：
1. 准确翻译人力资源专业术语、准确翻译人工智能专业术语
2. 保持语言简洁明了
3. 确保中文表达自然
4. 每行字幕长度适中（建议不超过 15 个汉字）
5. 严格保持每个字幕块的独立性，绝对不要合并或拆分字幕块
6. 保持 WEBVTT 格式不变
7. 严格保持时间戳格式：00:00:00.000 --> 00:00:00.000
8. 保持原始字幕块的数量不变，时间戳必须保持原样
9. 保持每个字幕块的标记 [BLOCK_X] 和 [/BLOCK_X]，其中 X 必须与原始标记编号完全一致

注意事项：
- 每个字幕块都有时间戳，这些时间戳必须保持不变
- 绝对禁止合并或拆分字幕块
- 翻译后的字幕块总数必须与原文完全一致
- 如果一个句子跨多个字幕块，也要严格保持原有的分块方式
- 必须保持每个字幕块的标记 [BLOCK_X] 和 [/BLOCK_X]，其中 X 必须与原始字幕块编号完全一致"""

            user_prompt = f"请将以下 VTT 字幕翻译成中文。注意：必须严格保持每个字幕块的独立性和标记，绝对不能合并或拆分字幕块，确保翻译前后的字幕块数量完全一致。每个字幕块的标记中的编号必须与原始字幕块编号完全一致。\n\n{marked_content}"

            if stream:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.2,
                    max_tokens=4096,
                    stream=True,
                )
                translated = ""
                for chunk_resp in response:
                    if chunk_resp.choices and chunk_resp.choices[0].delta.content:
                        content = chunk_resp.choices[0].delta.content
                        translated += content
                        print(content, end="", flush=True)
                print("\n", flush=True)
            else:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.2,
                    max_tokens=4096,
                    stream=False,
                )
                translated = response.choices[0].message.content

            if not translated.startswith("WEBVTT"):
                translated = "WEBVTT\n\n" + translated

            translated_blocks = []
            for i, block in enumerate(subtitle_blocks):
                block_start = translated.find(f"[BLOCK_{i}]")
                block_end = translated.find(f"[/BLOCK_{i}]")
                if block_start == -1 or block_end == -1:
                    raise ValueError(f"无法找到第 {i} 个字幕块的标记")
                block = translated[block_start + len(f"[BLOCK_{i}]"):block_end].strip()
                translated_blocks.append(block)

            final_translated = header + "\n\n" + "\n\n".join(translated_blocks)

            final_blocks = final_translated.split("\n\n")
            translated_blocks_count = len(final_blocks) - 1

            if translated_blocks_count != original_blocks_count:
                raise ValueError(f"翻译后字幕块数量不匹配：{original_blocks_count} -> {translated_blocks_count}")

            return final_translated

        except Exception as e:
            retry_count += 1
            last_error = e
            raise e

    raise last_error


def merge_translated_chunks(chunks: list[str], debug: bool = False) -> str:
    if not chunks:
        return ""

    if debug:
        print(f"\n开始合并 {len(chunks)} 个翻译块...", flush=True)

    parsed_chunks = []
    for i, chunk in enumerate(chunks):
        # 去掉 WEBVTT header（可能包含多行）
        blocks = chunk.strip().split("\n\n")
        if blocks and blocks[0].startswith("WEBVTT"):
            blocks = blocks[1:]
        if debug:
            print(f"- 第 {i + 1} 块包含 {len(blocks)} 个字幕", flush=True)
        parsed_chunks.append(blocks)

    merged_blocks = []

    for i, blocks in enumerate(parsed_chunks):
        if i == 0:
            merged_blocks.extend(blocks)
            if debug:
                print(f"- 保留第 1 块的所有字幕 ({len(blocks)} 个)", flush=True)
        else:
            blocks_to_add = blocks[10:]
            merged_blocks.extend(blocks_to_add)
            if debug:
                print(f"- 第 {i + 1} 块：跳过前 10 个重叠字幕，添加剩余 {len(blocks_to_add)} 个字幕", flush=True)

    if debug:
        print(f"\n合并完成，总共 {len(merged_blocks)} 个字幕", flush=True)

    # 重新组装成 VTT 格式
    merged = "WEBVTT\n\n" + "\n\n".join(merged_blocks)
    if not merged.endswith("\n"):
        merged += "\n"

    return merged


def get_output_path(input_path: str) -> str:
    """获取翻译文件的输出路径"""
    path = Path(input_path)
    stem = path.stem
    # 如果文件名以 .en 结尾，替换为 .zh-Hans
    if stem.endswith('.en'):
        stem = stem[:-3] + '.zh-Hans'
    else:
        stem = stem + '.zh-Hans'
    return str(path.parent / f"{stem}.vtt")


def print_validation_result(file_path: str, is_valid: bool, errors: list[str], show_details: bool = True) -> None:
    if show_details or not is_valid:
        print(f"\n验证文件：{file_path}", flush=True)
        if is_valid:
            print("验证通过，未发现问题", flush=True)
        else:
            print("验证失败，发现以下问题：", flush=True)
            for error in errors:
                print(f"- {error}", flush=True)


def verify_file(src_file: str, show_details: bool = True) -> tuple[bool, list[str]]:
    output_path = get_output_path(src_file)
    if not os.path.exists(output_path):
        return False, [f"翻译文件不存在：{output_path}"]

    is_valid, errors = verify_translation_details(src_file, output_path)
    print_validation_result(output_path, is_valid, errors, show_details)
    return is_valid, errors


def verify_files(vtt_files: list[str], show_details: bool = True) -> bool:
    all_valid = True
    for src_file in vtt_files:
        is_valid, _ = verify_file(src_file, show_details)
        if not is_valid:
            all_valid = False
    if not show_details:
        print("\n验证" + ("通过" if all_valid else "失败"), flush=True)
    return all_valid


def translate_vtt_file(input_path: str, client: OpenAI, model: str, debug: bool = False, stream: bool = False, limit: int = 0) -> bool:
    output_path = get_output_path(input_path)

    if os.path.exists(output_path):
        is_valid, errors = verify_translation_details(input_path, output_path)
        if is_valid:
            print(f"已存在有效的翻译文件：{output_path}", flush=True)
            return True
        else:
            print("\n已存在的翻译文件验证失败：", flush=True)
            for error in errors:
                print(f"- {error}", flush=True)

    try:
        with open(input_path, "r", encoding="utf-8") as f:
            content = f.read()

        if debug:
            print(f"\n开始翻译文件：{input_path}", flush=True)
            total_blocks = len(content.split('\n\n')) - 1
            print(f"字幕块数量：{total_blocks}", flush=True)

        chunks = split_vtt_content(content)

        # 限制处理块数
        if limit > 0 and len(chunks) > limit:
            print(f"[DEBUG] 限制处理前 {limit} 块 (共 {len(chunks)} 块)", flush=True)
            chunks = chunks[:limit]

        if debug:
            print(f"分块数量：{len(chunks)}", flush=True)

        translated_chunks = [""] * len(chunks)

        if stream:
            for i, chunk in enumerate(chunks):
                try:
                    print(f"正在翻译第 {i + 1}/{len(chunks)} 块...", flush=True)
                    translated_chunks[i] = translate_vtt_chunk(chunk, client, model, stream)
                    block_count = len(translated_chunks[i].split("\n\n")) - 1
                    print(f"第 {i + 1}/{len(chunks)} 块翻译完成 ({block_count} 个字幕)", flush=True)
                except Exception as e:
                    print(f"\n翻译失败 (第 {i + 1} 块): {str(e)}", flush=True)
                    return False
        else:
            with ThreadPoolExecutor(max_workers=2) as executor:
                future_to_idx = {executor.submit(translate_vtt_chunk, chunk, client, model, False): i
                                for i, chunk in enumerate(chunks)}
                for future in as_completed(future_to_idx):
                    idx = future_to_idx[future]
                    try:
                        translated_chunks[idx] = future.result()
                        block_count = len(translated_chunks[idx].split("\n\n")) - 1
                        print(f"第 {idx + 1}/{len(chunks)} 块翻译完成 ({block_count} 个字幕)", flush=True)
                    except Exception as e:
                        print(f"\n翻译失败 (第 {idx + 1} 块): {str(e)}", flush=True)
                        for f in future_to_idx:
                            f.cancel()
                        return False

        if debug:
            print("\n合并翻译结果...", flush=True)
        translated_content = merge_translated_chunks(translated_chunks, debug)
        merged_count = len(translated_content.split("\n\n")) - 1
        print(f"[DEBUG] 合并后字幕数量: {merged_count}", flush=True)

        temp_output_path = output_path + ".tmp"
        with open(temp_output_path, "w", encoding="utf-8") as f:
            f.write(translated_content)

        is_valid, errors = verify_translation_details(input_path, temp_output_path)
        if not is_valid:
            os.remove(temp_output_path)
            print("\n翻译验证失败：", flush=True)
            for error in errors:
                print(f"- {error}", flush=True)
            return False

        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(temp_output_path, output_path)
        return True

    except Exception as e:
        print(f"处理文件时出错：{str(e)}", flush=True)
        if os.path.exists(output_path + ".tmp"):
            os.remove(output_path + ".tmp")
        return False


def process_files(vtt_files: list[str], client: OpenAI, model: str, debug: bool = False, stream: bool = False, limit: int = 0) -> int:
    total_files = len(vtt_files)
    success_count = 0

    print(f"\n开始处理 {total_files} 个文件...", flush=True)
    for i, file_path in enumerate(vtt_files, 1):
        print(f"\n[{i}/{total_files}] 处理文件：{file_path}", flush=True)
        if not translate_vtt_file(file_path, client, model, debug, stream, limit):
            print(f"文件处理失败，中断处理", flush=True)
            return success_count
        success_count += 1
        print(f"文件处理成功 ({success_count}/{i} 成功)", flush=True)

    return success_count


def verify_translation_details(source_path: str, translated_path: str) -> tuple[bool, list[str]]:
    """详细验证翻译文件的内容"""
    try:
        source_header, source_blocks = parse_vtt(source_path)
        translated_header, translated_blocks = parse_vtt(translated_path)

        errors = []

        if not translated_header.strip() == "WEBVTT":
            errors.append(f"文件头部错误：应为'WEBVTT'，实际为'{translated_header}'")

        # 只验证已翻译的部分（翻译文件可能是部分翻译）
        check_count = min(len(source_blocks), len(translated_blocks))
        if check_count == 0:
            errors.append("没有可验证的字幕块")
            return False, errors

        print(f"[DEBUG] 验证 {check_count} 个字幕块", flush=True)

        for i, ((src_idx, src_ts, src_txt), (tr_idx, tr_ts, tr_txt)) in enumerate(
            zip(source_blocks[:check_count], translated_blocks[:check_count]), 1
        ):
            # 检查时间戳
            if len(src_ts) != 1 or len(tr_ts) != 1:
                errors.append(f"第 {i} 个字幕块时间戳数量错误：源文件 {len(src_ts)} vs 翻译文件 {len(tr_ts)}")
            elif src_ts != tr_ts:
                errors.append(f"第 {i} 个字幕块时间轴不匹配：{src_ts[0]} vs {tr_ts[0]}")

            for ts in tr_ts:
                if not re.match(r"^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$", ts):
                    errors.append(f"第 {i} 个字幕块时间戳格式错误：{ts}")
                else:
                    start_time, end_time = ts.split(" --> ")
                    if start_time >= end_time:
                        errors.append(f"第 {i} 个字幕块时间戳顺序错误：{start_time} >= {end_time}")

            if not tr_txt:
                errors.append(f"第 {i} 个字幕块翻译内容为空")
            elif src_txt == tr_txt:
                errors.append(f"第 {i} 个字幕块未被翻译，内容与源文件相同")
            elif any(len(line.strip()) > 45 for line in tr_txt):
                errors.append(f"第 {i} 个字幕块存在过长的行（超过 45 个字符）")

            for line in tr_txt:
                if re.search(r'<[^>]+>', line):
                    errors.append(f"第 {i} 个字幕块包含 HTML 标签：{line}")
                if '\t' in line:
                    errors.append(f"第 {i} 个字幕块包含制表符")
                if line.startswith(' ') or line.endswith(' '):
                    errors.append(f"第 {i} 个字幕块行首或行尾有空格：'{line}'")

        return not bool(errors), errors

    except Exception as e:
        return False, [f"验证过程出错：{str(e)}"]


def main():
    parser = argparse.ArgumentParser(description="批量翻译 VTT 字幕文件")
    parser.add_argument("--dir", "-d", type=str, default=".", help="要处理的目录路径")
    parser.add_argument("--file", "-f", type=str, help="要翻译的单个文件路径")
    parser.add_argument("--verify", "-v", action="store_true", help="仅验证已翻译文件")
    parser.add_argument("--details", "-D", action="store_true", help="显示详细的验证信息")
    parser.add_argument("--debug", action="store_true", help="显示调试信息")
    parser.add_argument("--stream", "-s", action="store_true", help="流式输出 (串行处理)")
    parser.add_argument("--limit", "-l", type=int, default=0, help="限制处理的块数 (0=不限制)")
    args = parser.parse_args()

    if args.file and args.dir != ".":
        print("错误：--file 和--dir 参数不能同时使用", flush=True)
        return

    setup_logging()

    if args.verify or args.details:
        if args.file:
            verify_file(args.file, args.details)
        else:
            verify_files(find_vtt_files(args.dir), args.details)
        return

    vtt_files = [args.file] if args.file else find_vtt_files(args.dir)
    if not vtt_files:
        print("未找到需要翻译的 VTT 文件", flush=True)
        return

    client, model = init_openai_client()
    success_count = process_files(vtt_files, client, model, args.debug, args.stream, args.limit)
    print(f"\n处理完成：{success_count}/{len(vtt_files)} 个文件成功翻译", flush=True)

    verify_files(vtt_files, show_details=False)


if __name__ == "__main__":
    main()
