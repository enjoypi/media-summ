import os
import re
import json
import asyncio
from typing import List, Dict, Optional, Set
from pathlib import Path
from openai import OpenAI, AsyncOpenAI
from dotenv import load_dotenv
import aiofiles
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Config:
    """配置类，用于管理环境变量和配置项"""
    required_env_vars: Set[str] = frozenset({
        "OPENAI_API_KEY",
        "LLM_BASE_URL",
        "LLM_MODEL"
    })

    @classmethod
    def validate_env(cls) -> None:
        """验证必需的环境变量是否存在"""
        missing_vars = [var for var in cls.required_env_vars if not os.getenv(var)]
        if missing_vars:
            raise ValueError(f"请在.env文件中设置以下环境变量: {', '.join(missing_vars)}")


class VTTProcessor:
    """VTT文件处理器"""

    def __init__(self, directory: Path):
        self.directory = directory
        self.cache_dir = directory / '.cache'
        self.cache_file = self.cache_dir / 'vtt_content.json'

    @staticmethod
    def clean_vtt_content(content: str) -> str:
        """清理VTT文件内容，只保留字幕文本

        Args:
            content: VTT文件原始内容

        Returns:
            清理后的文本内容
        """
        lines = content.split('\n')
        cleaned_lines = []

        patterns_to_skip = [
            r'^WEBVTT$',
            r'^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$',
            r'^\s*$',
            r'^\d+$'
        ]

        for line in lines:
            if any(re.match(pattern, line.strip()) for pattern in patterns_to_skip):
                continue
            cleaned_lines.append(line.strip())

        return ' '.join(cleaned_lines)

    def get_all_vtt_files(self) -> List[Path]:
        """递归获取目录下所有的VTT文件，并按模块和文件名排序

        Returns:
            排序后的VTT文件路径列表
        """
        try:
            module_dirs = sorted(
                [d for d in self.directory.iterdir()
                 if d.is_dir() and d.name.startswith('Module ')]
            )

            vtt_files = []
            for module_dir in module_dirs:
                module_files = sorted(
                    [f for f in module_dir.iterdir()
                     if f.suffix.lower() == '.vtt']
                )
                vtt_files.extend(module_files)

            if not vtt_files:
                print(f"警告：在目录 {self.directory} 中未找到VTT文件")  # LLM控制台输出

            return vtt_files

        except Exception as e:
            print(f"获取VTT文件时出错: {str(e)}")  # LLM控制台输出
            return []

    async def process_vtt_file(self, file_path: Path) -> str:
        """异步处理单个VTT文件

        Args:
            file_path: VTT文件路径

        Returns:
            处理后的文本内容
        """
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
            return self.clean_vtt_content(content)
        except Exception as e:
            print(f"处理文件 {file_path} 时出错: {str(e)}")  # LLM控制台输出
            return ""

    async def process_all_files(self) -> str:
        """异步处理所有VTT文件并返回合并后的内容

        Returns:
            合并后的文本内容
        """
        # 检查缓存
        if self.cache_file.exists():
            print("发现缓存文件，正在读取...")  # LLM控制台输出
            try:
                async with aiofiles.open(self.cache_file, 'r', encoding='utf-8') as f:
                    cache_data = json.loads(await f.read())
                return cache_data['content']
            except Exception as e:
                print(f"读取缓存文件时出错: {str(e)}")  # LLM控制台输出

        vtt_files = self.get_all_vtt_files()
        if not vtt_files:
            raise ValueError("未找到VTT文件")

        # 异步处理所有文件
        tasks = [self.process_vtt_file(vtt_file) for vtt_file in vtt_files]
        contents = await asyncio.gather(*tasks)
        merged_content = "\n\n".join(filter(None, contents))

        # 保存缓存
        await self._save_cache(merged_content, vtt_files)
        return merged_content

    async def _save_cache(self, content: str, files: List[Path]) -> None:
        """保存处理结果到缓存

        Args:
            content: 合并后的文本内容
            files: 处理的文件列表
        """
        try:
            self.cache_dir.mkdir(exist_ok=True)
            cache_data = {
                'content': content,
                'files': [str(f.relative_to(self.directory)) for f in files],
                'timestamp': datetime.now().isoformat()
            }
            async with aiofiles.open(self.cache_file, 'w', encoding='utf-8') as f:
                await f.write(json.dumps(cache_data, ensure_ascii=False, indent=2))
        except Exception as e:
            print(f"保存缓存文件时出错: {str(e)}")  # LLM控制台输出


class MindMapGenerator:
    """思维导图生成器"""

    def __init__(self):
        self.client = AsyncOpenAI(base_url=os.getenv("LLM_BASE_URL"))

    async def generate(self, content: str) -> str:
        """生成PlantUML思维导图

        Args:
            content: 要处理的文本内容

        Returns:
            PlantUML格式的思维导图代码
        """
        print("正在调用LLM生成思维导图...")  # LLM控制台输出

        try:
            response = await self.client.chat.completions.create(
                model=os.getenv("LLM_MODEL"),
                messages=[
                    {"role": "system", "content": """我希望你能担任一位人力资源专家。你的任务是从一篇关于AI在人力资源管理中应用的演讲，根据员工在公司的生命周期的各个阶段，帮助我总结出一份清晰的思维导图。你的职责包括：
1. **阅读与分析**：提取文章中的关键主题，尤其是AI在人力资源管理中的具体应用领域。和应用不相关的主题或内容可以不输出。
2. **结构化信息**：将文章内容整理成层次分明的思维导图，包括主干（核心主题）、分支（具体方法）、以及叶节点（案例或细节）。
边界：你不需要创造新的技术或案例，只需基于文章内容进行总结和提炼。
注意，思维导图中的所有内容均来自于我提供的文本，不要有任何发挥。请严格按照PlantUML思维导图的格式输出内容(中英双语)。不要输出任何解释性文字，只输出可以直接用于生成思维导图的代码。"""},
                    {"role": "user", "content": content}
                ],
                temperature=0.7,
                max_tokens=4000
            )

            content = response.choices[0].message.content
            return self._extract_plantuml_code(content)

        except Exception as e:
            print(f"生成思维导图时出错: {str(e)}")  # LLM控制台输出
            raise

    @staticmethod
    def _extract_plantuml_code(content: str) -> str:
        """从响应中提取PlantUML代码

        Args:
            content: 包含PlantUML代码的响应内容

        Returns:
            纯PlantUML代码
        """
        if "```plantuml" in content:
            content = content.split("```plantuml")[1]
        if "```" in content:
            content = content.split("```")[0]
        return content.strip()


async def main():
    """主函数"""
    try:
        # 加载和验证环境变量
        load_dotenv(override=False)
        Config.validate_env()

        # 初始化处理器
        current_dir = Path.cwd()
        print(f"开始处理目录: {current_dir}")  # LLM控制台输出

        vtt_processor = VTTProcessor(current_dir)
        content = await vtt_processor.process_all_files()

        # 生成思维导图
        mindmap_generator = MindMapGenerator()
        mindmap = await mindmap_generator.generate(content)

        # 保存思维导图
        output_file = current_dir / "mindmap.puml"
        async with aiofiles.open(output_file, 'w', encoding='utf-8') as f:
            await f.write(mindmap)

        print(f"思维导图已生成并保存到: {output_file}")  # LLM控制台输出

    except Exception as e:
        print(f"程序执行出错: {str(e)}")  # LLM控制台输出
        raise


if __name__ == "__main__":
    asyncio.run(main())