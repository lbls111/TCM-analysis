# LogicMaster | 智能中医计算引擎

CF云服务版 - 智能中医计算器

## 项目简介

LogicMaster TCM 是一个基于 React 和 AI 的中医处方分析与计算引擎。它结合了传统中医理论（三焦、五味、四气）与现代计算技术，提供处方物理明细、三焦药势分布可视化以及 AI 深度推演报告。

## 功能特性

*   **计算工坊**: 自动解析处方，计算寒热指数 (PTI) 与三焦分布。
*   **三焦动力**: 可视化展示药势在三焦（上、中、下）的流动与分布。
*   **AI 推演**: 集成 LLM 模型，生成深度或快速的处方审核报告。
*   **药典库**: 内置云端同步的《中国药典》数据库。
*   **AI 问答**: 基于上下文的智能中医研讨助手。

## 快速开始

1.  安装依赖:
    ```bash
    npm install
    ```

2.  启动开发服务器:
    ```bash
    npm run dev
    ```

3.  构建生产版本:
    ```bash
    npm run build
    ```

## 环境变量配置

本项目支持通过环境变量配置 API Key 和数据库连接。建议在本地创建 `.env` 文件进行配置（请勿将敏感的 `.env` 或 `.env.local` 文件提交到版本控制系统）。

## 部署说明

**重要提示**：
本项目是 React 单页应用 (SPA)。在部署到 Cloudflare Pages、Vercel 或 Netlify 时，请确保使用以下配置：

*   **构建命令 (Build Command)**: `npm run build`
*   **输出目录 (Output Directory/Publish directory)**: `dist`

(请勿使用 `vitepress build`，这是文档构建命令，不适用于本项目)