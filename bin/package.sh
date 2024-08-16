#!/bin/bash

# 设置项目根目录
PROJECT_ROOT=$(pwd)

# 设置目标目录名
TARGET_DIR="obsidian-newledge"

# 检查并删除已存在的目标目录
if [ -d "$PROJECT_ROOT/$TARGET_DIR" ]; then
    echo "删除已存在的 $TARGET_DIR 目录"
    rm -rf "$PROJECT_ROOT/$TARGET_DIR"
fi

# 创建新的目标目录
echo "创建新的 $TARGET_DIR 目录"
mkdir "$PROJECT_ROOT/$TARGET_DIR"

# 复制所需文件到目标目录
echo "复制文件到 $TARGET_DIR 目录"
cp "$PROJECT_ROOT/main.js" "$PROJECT_ROOT/$TARGET_DIR/"
cp "$PROJECT_ROOT/styles.css" "$PROJECT_ROOT/$TARGET_DIR/"
cp "$PROJECT_ROOT/manifest.json" "$PROJECT_ROOT/$TARGET_DIR/"

echo "打包完成"
