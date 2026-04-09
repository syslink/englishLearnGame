# English Voice Learning Game (英语语音打词游戏)

一款基于语音识别的英语单词学习游戏，通过游戏化的方式帮助用户练习英语词汇。

## 功能特色

### 两种游戏模式

- **释义匹配模式** — 屏幕显示中文释义，用户通过语音说出对应的英文单词，系统自动识别并评分
- **飞机射击模式** — 单词从屏幕上方掉落，用户通过语音锁定目标词，再用方向键控制飞机射击消灭

### 语音识别

- 基于 Web Speech API，支持 Chrome / Edge / Safari
- 模糊匹配算法（Levenshtein 距离），容错率 58%，支持多词短语识别
- 内置 TTS 发音功能，点击单词即可听读音

### 词库管理

- 支持自定义输入词库（格式：`english=中文`）
- 内置三级难度词库：
  - **简单** — 常见单词（apple, book, family 等）
  - **中等** — 短语动词（take off, look after 等）
  - **困难** — 高级表达（sustainable, collaboration 等）
- 可按难度随机生成词库

### 学习追踪

- 单词级学习记录（见过次数、正确/错误次数、上次学习时间）
- 学习批次管理，按学习场次统计成绩
- 高频错误词统计，方便针对性复习

### 游戏机制

- 连击(Streak)系统，每 3 连击奖励时间加成
- 粒子特效（正确时的表情爆炸动画）
- 实时统计面板（总数、完成数、正确率、连击数）

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 14.2.5 | 应用框架 |
| React | 18.3.1 | UI 组件 |
| TypeScript | 5.5.3 | 类型安全 |
| Tailwind CSS | 3.4.6 | 样式 |

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 生产构建
npm run build && npm start
```

启动后访问 `http://localhost:3000`。

## 浏览器要求

- 需要支持 Web Speech API 的现代浏览器（推荐 Chrome）
- 需要授权麦克风权限

## 项目结构

```
app/
├── layout.tsx      # 根布局
├── page.tsx        # 游戏主组件（包含全部游戏逻辑）
└── globals.css     # 全局样式与动画
```

## 数据存储

学习记录通过 localStorage 持久化，包括：
- `english_voice_game_study_history_v1` — 单词学习历史
- `english_voice_game_study_batch_v1` — 学习批次记录
