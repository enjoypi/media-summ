#!/bin/bash

# 检查输入参数
if [ "$#" -ne 2 ]; then
    echo "用法: $0 <输入文件.m4a> <分段数量 n>"
    exit 1
fi

input_file="$1"
n="$2"

# 检查文件是否存在
if [ ! -f "$input_file" ]; then
    echo "错误: 文件 '$input_file' 不存在!"
    exit 1
fi

# 检查 n 是否为正整数
if ! [[ "$n" =~ ^[1-9][0-9]*$ ]]; then
    echo "错误: 分段数量 n 必须是正整数!"
    exit 1
fi

# 使用 ffmpeg 获取音频时长（秒）
duration=$(ffmpeg -i "$input_file" 2>&1 | grep Duration | awk '{print $2}' | tr -d , | awk -F: '{ print ($1*3600) + ($2*60) + $3 }')
if [ -z "$duration" ]; then
    echo "错误: 无法获取音频时长，请检查文件格式或 FFmpeg 版本!"
    exit 1
fi

# 计算每段时长
segment_time=$(awk -v dur="$duration" -v n="$n" 'BEGIN { print dur / n }')

# 生成分割时间点（1/n, 2/n, ..., (n-1)/n）
segment_times=""
for ((i=1; i<n; i++)); do
    time_point=$(awk -v dur="$duration" -v i="$i" -v n="$n" 'BEGIN { print dur * i / n }')
    segment_times+="$time_point,"
done
segment_times=${segment_times%,}  # 移除末尾逗号

# 使用 FFmpeg 分割
echo "正在分割 '$input_file' 为 $n 段，每段约 ${segment_time} 秒..."
ffmpeg -i "$input_file" -f segment -segment_times "$segment_times" -c copy "${input_file%.*}_%03d.m4a"

# 检查是否成功
if [ $? -eq 0 ]; then
    echo "✅ 分割完成！输出文件:"
    ls "${input_file%.*}_"*.m4a
else
    echo "❌ 分割失败，请检查 FFmpeg 错误信息!"
    exit 1
fi
