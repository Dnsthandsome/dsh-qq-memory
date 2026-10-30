# dsh-qq-memory

给 **DeepSeek Harness** 的 QQ 机器人（[`dsh-qq-moony`](https://www.npmjs.com/package/dsh-qq-moony)）配的**记忆管理插件**。

它把散落在磁盘上的记忆文件，变成一个能在设置页里点、能看、能改的面板：按角色浏览记忆、给事实调权重、按艾宾浩斯遗忘曲线降权、实时看「这一轮机器人到底吃进去多少字」。

---

## 它解决什么问题

`dsh-qq-moony` 每收到一条消息，都会把 `<cwd>/memory/MEMORY.md` 和当天日记从尾部截断，塞进提示词（预算默认 2000 字）。这套机制本身没问题，但用起来有几个痛点：

- 记忆文件是裸 md，想改一条事实得去翻文件夹
- 不知道预算用了多少，等发现 100% 满了，新记忆已经塞不进去
- 「重要的事」和「随口一句」权重一样，久了记忆全是噪音
- 机器人不会自己遗忘，只增不减

这个插件就是补这几块的：**看得见、改得动、会遗忘**。

## 功能

| 模块 | 说明 |
|---|---|
| **总览** | 角色根目录、当前正在跑的角色、会话 id、人设字数、章程在不在 |
| **记忆文件** | 按角色浏览 / 编辑 `MEMORY.md`、`FACTS.md`、`REFLECT.md`、`YYYY-MM-DD.md`，改完即存 |
| **注入预览** | 真实模拟 moony 的注入逻辑（含「当天没日记就退到最近一篇」），显示每个文件实际注入多少字、有没有被截断、预算占用百分比 |
| **加权事实** | 把 `FACTS.md` 解析成「权重 / 最近回忆日期 / 事实」的条目，带权重色块，可单条复习 +1、可一键按遗忘曲线整理 |
| **章程体检** | 检查 persona 里的【自我记忆管理系统】那一节还在不在、多少字 |

## 记忆文件格式

`FACTS.md` 每一行一条事实：

```markdown
- w9 | 2026-10-29 | 他是学生，喜欢被叫宝宝，不喜欢全名
- w7 | 2026-10-29 | 他熬夜写代码，凌晨两三点还在
- w3 | 2026-10-20 | 他说过想养一只猫
```

- `w` 是权重，**0–10**：`≥8` 核心记忆，`≤4` 可遗忘
- `d` 是最近一次回忆日期，遗忘曲线按它算
- 解析很宽松：`w: 9`、`w=9`、全角竖线 `｜`、缺日期都认

遗忘规则：**每 `everyDays` 天没被回忆，权重 -1**；权重掉到 `dropBelow` 以下直接删除。点「复习」= 权重 +1（封顶 10）+ 日期改成今天。

## 安装

> 尚未发布到 npm，直接从 GitHub 装。

**方式一：让 dsh 从 GitHub 拉取**

```bash
dsh plugin --profile desktop add github:Dnsthandsome/dsh-qq-memory
```

**方式二：下载后本地打包**

```bash
git clone https://github.com/Dnsthandsome/dsh-qq-memory.git
cd dsh-qq-memory
pnpm pack --pack-destination dist-pkgs
dsh plugin --profile desktop add dist-pkgs/dsh-qq-memory-0.1.1.tgz
```

装完刷新页面，**设置页**里会多出一个「记忆管理」分区。

> 改完插件代码要 `remove` 再 `add`，光 `add` 宿主不会重载代码。

## 配置

`<DSH_HOME>/qq-memory/config.json`：

```json
{
  "roleRoot": "D:\\bigWhale\\roles"
}
```

`roleRoot` 也可以用环境变量 `BIGWHALE_ROOT` 覆盖，默认 `D:\bigWhale\roles`。

目录结构按「一个角色一个文件夹」：

```
<roleRoot>/
  heihei/
    memory/
      MEMORY.md          长期记忆，每轮注入
      FACTS.md           加权事实库，按需读取
      REFLECT.md         反思本
      2026-10-29.md      当天日记，每轮注入
  wenrou/
    memory/ ...
```

插件从 `<DSH_HOME>/qq-moony/config.json` 读 moony 当前的 `cwd` / `sessionId` / `maxContextChars` / `persona`，所以**切换角色只要改 moony 的 cwd 指向，这个面板会自动跟着换**。

## HTTP 接口

前缀 `/api/qq-memory`：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/overview` | 总览：角色列表 + moony 当前指向 + 章程体检 |
| GET | `/inject?role=` | 注入预览 |
| GET | `/charter` | 只取章程体检 |
| GET | `/file?role=&name=` | 读一个记忆文件 |
| POST | `/file` | 写一个记忆文件 `{role, name, content}` |
| GET | `/facts?role=` | FACTS 解析结果（条目 / 其他行 / 统计） |
| POST | `/facts` | 整体写回 `{role, entries}` |
| POST | `/decay` | 遗忘整理 `{role, everyDays=7, dropBelow=1}` |
| POST | `/review` | 复习 `{role, keyword}` → 命中的条目权重 +1 |

安全边界：角色 id 限 `[A-Za-z0-9_-]{1,32}`，文件名限 `[A-Za-z0-9_.-]{1,40}.md`，路径 resolve 后必须落在 `<roleRoot>/<角色>/memory` 之内，否则 400。

## 配套

- [`dsh-qq-moony`](https://www.npmjs.com/package/dsh-qq-moony) —— QQ 机器人本体（OneBot / NapCat）
- [`dsh-qq-persona`](https://github.com/Dnsthandsome/dsh-qq-persona) —— 人格切换，每个性格独立 cwd / sessionId / 音色（本插件按 cwd 自动跟随）
- [`dsh-qq-media`](https://github.com/Dnsthandsome/dsh-qq-media) —— 语音/图片/视频/文件出口（语音条、音色切换）

## License

MIT
