/**
 * dsh-qq-memory —— QQ 机器人「记忆管理」插件。
 *
 * 背景：之前的记忆管理不是插件，而是三样散着的东西：
 *   ① 一段章程文本塞在 moony 的 persona 里（【自我记忆管理系统】五节）
 *   ② 一堆普通 md 文件躺在各角色的 cwd（D:\bigWhale\roles\<id>\memory\）
 *   ③ dsh-qq-moony 自带的 读记忆片段() 每轮把 MEMORY.md + 当天日记截断注入
 *
 * 这个插件把 ①②③ 收进一个可操作的面板：
 *   - 按角色浏览 / 编辑 MEMORY.md、FACTS.md、REFLECT.md、YYYY-MM-DD.md
 *   - FACTS.md 解析成「权重 w / 回忆日期 d / 事实」的可视化条目，能拖权重、点复习、按遗忘曲线整理
 *   - 注入预览：真实模拟 moony 的 读记忆片段()，看到机器人这轮实际吃到多少字
 *   - 章程体检：确认 persona 里的【自我记忆管理系统】还在不在、多少字
 *
 * 它不改 moony 本体，只读写记忆文件和读配置；写文件即刻生效（moony 每轮现读磁盘）。
 *
 * 文件布局：
 *   <DSH_HOME>/qq-memory/config.json   —— { roleRoot? }
 *   <roleRoot>/<角色>/memory/*.md      —— 记忆本体（默认 D:\bigWhale\roles\<id>\memory）
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

export const name = 'qq-memory';

const 版本 = '0.1.1';

/** 记忆文件允许的名字（防目录穿越） */
const 文件名规则 = /^[A-Za-z0-9_.\-]{1,40}\.md$/;
/** 角色 id 允许的样子 */
const 角色名规则 = /^[A-Za-z0-9_\-]{1,32}$/;
/** 记忆目录里的固定四件套 */
const 固定文件 = ['MEMORY.md', 'FACTS.md', 'REFLECT.md'];

function 家() {
  return process.env.DSH_HOME || join(homedir(), '.dsh');
}

function 目录() {
  return join(家(), 'qq-memory');
}

function 读Json(文件, 兜底) {
  try {
    if (existsSync(文件)) return JSON.parse(readFileSync(文件, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    /* 读坏了用兜底 */
  }
  return 兜底;
}

function 写Json(文件, 数据) {
  mkdirSync(dirname(文件), { recursive: true });
  writeFileSync(文件, JSON.stringify(数据, null, 2), 'utf8');
}

function 读配置() {
  return 读Json(join(目录(), 'config.json'), {});
}

/** 角色根：配置优先，其次环境变量，最后默认 */
function 角色根() {
  const 配置 = 读配置();
  return 配置.roleRoot || process.env.BIGWHALE_ROOT || 'D:\\bigWhale\\roles';
}

/** moony 当前运行配置（cwd / sessionId / 注入预算 / persona） */
function 读Moony() {
  return 读Json(join(家(), 'qq-moony', 'config.json'), {});
}

function 本地日期(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 安全拼出 <角色根>/<角色>/memory/<文件>，越界一律抛错 */
function 安全路径(角色, 文件) {
  if (!角色名规则.test(String(角色 ?? ''))) throw new Error(`角色 id 不合法：${角色}`);
  if (!文件名规则.test(String(文件 ?? ''))) throw new Error(`文件名不合法：${文件}`);
  const 根 = resolve(角色根());
  const 基 = resolve(join(根, 角色, 'memory'));
  if (!基.startsWith(根 + sep)) throw new Error('角色目录越界');
  const 目标 = resolve(join(基, 文件));
  if (!目标.startsWith(基 + sep)) throw new Error('记忆文件越界');
  return 目标;
}

function 记忆目录(角色) {
  if (!角色名规则.test(String(角色 ?? ''))) throw new Error(`角色 id 不合法：${角色}`);
  const 根 = resolve(角色根());
  const 基 = resolve(join(根, 角色, 'memory'));
  if (!基.startsWith(根 + sep)) throw new Error('角色目录越界');
  return 基;
}

function 文件清单(角色) {
  const 基 = 记忆目录(角色);
  if (!existsSync(基)) return [];
  return readdirSync(基)
    .filter((n) => 文件名规则.test(n))
    .sort()
    .map((n) => {
      const 全 = join(基, n);
      let 大小 = 0;
      let 改时间 = 0;
      try {
        const st = statSync(全);
        大小 = st.size;
        改时间 = st.mtimeMs;
      } catch {
        /* 忽略 */
      }
      const 种类 = 固定文件.includes(n) ? '固定' : /^\d{4}-\d{2}-\d{2}\.md$/.test(n) ? '日记' : '其他';
      return { name: n, size: 大小, mtime: 改时间, kind: 种类 };
    });
}

function 角色清单() {
  const 根 = resolve(角色根());
  if (!existsSync(根)) return [];
  return readdirSync(根)
    .filter((n) => 角色名规则.test(n))
    .filter((n) => {
      try {
        return statSync(join(根, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .map((id) => {
      const 文件s = 文件清单(id);
      const facts = 文件s.find((f) => f.name === 'FACTS.md');
      let 条数 = 0;
      if (facts) {
        try {
          条数 = 解析FACTS(读文本(id, 'FACTS.md')).条目.length;
        } catch {
          /* 忽略 */
        }
      }
      return { id, files: 文件s, 文件数: 文件s.length, 事实条数: 条数, 有记忆: 文件s.length > 0 };
    });
}

function 读文本(角色, 文件) {
  const 全 = 安全路径(角色, 文件);
  if (!existsSync(全)) return '';
  return readFileSync(全, 'utf8').replace(/^\uFEFF/, '');
}

function 写文本(角色, 文件, 内容) {
  if (!文件名规则.test(String(文件 ?? ''))) throw new Error(`文件名不合法：${文件}`);
  const 全 = 安全路径(角色, 文件);
  mkdirSync(dirname(全), { recursive: true });
  writeFileSync(全, String(内容 ?? ''), 'utf8');
  return { name: 文件, size: Buffer.byteLength(String(内容 ?? ''), 'utf8') };
}

/* ─────────────────────────── FACTS 解析与维护 ─────────────────────────── */

/**
 * FACTS.md 的一行事实：`- w9 | 2026-10-29 | 我是「大鲸鱼」…`
 * 宽松解析，允许 `w: 9` / `w=9` / 缺日期 / 全角竖线。
 */
function 解析FACTS(文本) {
  const 行们 = String(文本 ?? '').split(/\r?\n/);
  const 条目 = [];
  const 其他 = [];
  行们.forEach((原文, 行号) => {
    const m = 原文.match(
      /^\s*[-*]?\s*w\s*[:=＝]?\s*(\d+(?:\.\d+)?)\s*[|｜]\s*(?:([0-9]{4}-[0-9]{2}-[0-9]{2})\s*[|｜]\s*)?(.*)$/i,
    );
    if (m) {
      条目.push({ 行号, w: Number(m[1]), d: m[2] || '', text: (m[3] || '').trim() });
    } else {
      其他.push(原文);
    }
  });
  const 权重们 = 条目.map((e) => e.w);
  const 统计 = {
    条数: 条目.length,
    最高: 权重们.length ? Math.max(...权重们) : 0,
    最低: 权重们.length ? Math.min(...权重们) : 0,
    均权: 权重们.length ? Number((权重们.reduce((a, b) => a + b, 0) / 权重们.length).toFixed(2)) : 0,
    核心: 条目.filter((e) => e.w >= 8).length,
    观察: 条目.filter((e) => e.w <= 4).length,
    未标日期: 条目.filter((e) => !e.d).length,
  };
  return { 条目, 其他, 统计 };
}

/** 把条目写回原文件：已存在的按行号原位替换、被删的去掉、新追加到末尾，保留标题与注释 */
function 写回FACTS(角色, 条目们) {
  const 原 = 读文本(角色, 'FACTS.md');
  const 行们 = String(原 ?? '').split(/\r?\n/);
  const 原解析 = 解析FACTS(原);
  const 原行号集 = new Set(原解析.条目.map((e) => e.行号));
  const 按行号 = new Map();
  条目们.forEach((e) => {
    const 行号 = Number.isInteger(e.行号) && 原行号集.has(e.行号) ? e.行号 : null;
    if (行号 === null) return;
    按行号.set(行号, e);
  });
  const 新行们 = [];
  行们.forEach((原文, i) => {
    if (!原行号集.has(i)) {
      新行们.push(原文);
      return;
    }
    const e = 按行号.get(i);
    if (!e) return; // 被删除
    新行们.push(格式化事实(e));
  });
  // 新条目（没有行号或行号不在原文件里）追加到末尾
  条目们.forEach((e) => {
    const 已存在 = Number.isInteger(e.行号) && 原行号集.has(e.行号);
    if (!已存在) 新行们.push(格式化事实(e));
  });
  const 结果 = 新行们.join('\n').replace(/\n{3,}$/, '\n');
  写文本(角色, 'FACTS.md', 结果);
  return 解析FACTS(结果);
}

function 格式化事实(e) {
  const w = Math.max(0, Math.min(10, Number(e.w ?? 5)));
  const d = e.d || 本地日期();
  const 权 = Number.isInteger(w) ? String(w) : String(w);
  return `- w${权} | ${d} | ${String(e.text ?? '').trim()}`;
}

/** 艾宾浩斯降权：每 everyDays 天没被回忆 → 掉 1 权；w 掉到 dropBelow 以下 → 删除 */
function 遗忘整理(角色, 每几天 = 7, 删除线 = 1) {
  const { 条目 } = 解析FACTS(读文本(角色, 'FACTS.md'));
  const 今天 = new Date(`${本地日期()}T00:00:00`);
  const 变化 = [];
  const 保留 = [];
  for (const e of 条目) {
    if (!e.d) {
      保留.push(e);
      continue;
    }
    const 天 = Math.floor((今天.getTime() - new Date(`${e.d}T00:00:00`).getTime()) / 86400000);
    if (!Number.isFinite(天) || 天 <= 0) {
      保留.push(e);
      continue;
    }
    const 掉 = Math.floor(天 / 每几天);
    if (掉 <= 0) {
      保留.push(e);
      continue;
    }
    const 新权 = e.w - 掉;
    if (新权 < 删除线) {
      变化.push({ text: e.text, 动作: '删除', 旧权: e.w, 新权: 0, 隔了天: 天 });
      continue;
    }
    if (新权 !== e.w) 变化.push({ text: e.text, 动作: '降权', 旧权: e.w, 新权, 隔了天: 天 });
    保留.push({ ...e, w: 新权 });
  }
  const 结果 = 写回FACTS(角色, 保留);
  return { 变化, 剩余: 结果.条目.length, 统计: 结果.统计 };
}

/** 复习：被用到的旧事实，d 更新成今天，权重 +1（封顶 10） */
function 复习(角色, 关键字) {
  const { 条目 } = 解析FACTS(读文本(角色, 'FACTS.md'));
  const 命中 = [];
  const 新 = 条目.map((e) => {
    if (String(e.text).includes(String(关键字))) {
      命中.push(e.text);
      return { ...e, w: Math.min(10, e.w + 1), d: 本地日期() };
    }
    return e;
  });
  if (!命中.length) return { ok: false, error: `FACTS 里没有包含「${关键字}」的条目` };
  const 结果 = 写回FACTS(角色, 新);
  return { ok: true, 命中, 统计: 结果.统计 };
}

/* ───────────────────── 注入预览（真实模拟 moony 的读记忆片段） ───────────────────── */

function 注入预览(角色, moony) {
  const 根 = 角色 ? join(角色根(), 角色) : moony.cwd || process.cwd();
  const 今天 = 本地日期();
  const 预算总 = Number(moony.maxContextChars ?? 2000);
  const 候选 =
    Array.isArray(moony.contextFiles) && moony.contextFiles.length > 0
      ? [...moony.contextFiles]
      : ['memory/MEMORY.md', `memory/${今天}.md`];

  // 当天日记没有就退一步拿最近的一篇（与 moony 一致）
  const 日记路径 = 候选.find((x) => x.startsWith('memory/') && x.endsWith('.md') && x.includes(今天));
  if (日记路径 && !existsSync(join(根, 日记路径))) {
    try {
      const 目录2 = join(根, 'memory');
      const 最近的 = readdirSync(目录2)
        .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
        .sort()
        .pop();
      if (最近的) 候选[候选.indexOf(日记路径)] = `memory/${最近的}`;
    } catch {
      /* 找不到就算了 */
    }
  }

  const 片段 = [];
  let 预算 = 预算总;
  for (const 相对 of 候选) {
    if (预算 <= 0) break;
    try {
      const 文件 = join(根, 相对);
      if (!existsSync(文件)) continue;
      const 原文 = readFileSync(文件, 'utf8').replace(/^\uFEFF/, '');
      const 截 = 原文.slice(-预算);
      片段.push({ 文件: 相对, 全文长: 原文.length, 实际注入: 截.length, 被截断: 原文.length > 截.length });
      预算 -= 截.length;
    } catch {
      /* 读不到就算了 */
    }
  }
  const 已用 = 预算总 - Math.max(0, 预算);
  return {
    根,
    预算总,
    已用,
    剩余: Math.max(0, 预算),
    占用比: 预算总 > 0 ? Number(((已用 / 预算总) * 100).toFixed(1)) : 0,
    候选,
    片段,
    autoContext: moony.autoContext !== false,
  };
}

/** 从 moony persona 里截出【自我记忆管理系统】那一节，看章程还在不在 */
function 章程体检() {
  const persona = String(读Moony().persona ?? '');
  const 起 = persona.indexOf('【自我记忆管理系统】');
  if (起 < 0) return { 在: false, 长度: 0, 文本: '', persona长度: persona.length };
  // 到下一个【】小节或文末
  const 后 = persona.slice(起 + '【自我记忆管理系统】'.length);
  const 下一个 = 后.indexOf('\n【');
  const 文本 = 下一个 >= 0 ? 后.slice(0, 下一个) : 后;
  return { 在: true, 长度: 文本.length, 文本: 文本.trim(), persona长度: persona.length };
}

/* ─────────────────────────────── HTTP 层 ─────────────────────────────── */

function 收集Body(req) {
  return new Promise((resolve2, reject) => {
    const 块 = [];
    req.on('data', (c) => 块.push(c));
    req.on('end', () => resolve2(Buffer.concat(块).toString('utf8')));
    req.on('error', reject);
  });
}

export async function apply(ctx, 配置) {
  const c = { ...(配置 ?? {}) };
  if (c.enabled === false) return;

  ctx.inject(['webServer'], (子) => {
    子.effect(() => {
      子.webServer.register({
        kind: 'prefix',
        path: '/api/qq-memory',
        handler: async (req, res) => {
          const u = new URL(req.url, 'http://127.0.0.1');
          const 路径 = u.pathname.replace(/\/+$/, '');
          const 查询 = u.searchParams;
          const 发 = (情况, 数据) => {
            res.writeHead(情况, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(数据));
          };

          try {
            /* 总览：角色 + moony 当前指向 + 章程体检 */
            if (req.method === 'GET' && 路径 === '/api/qq-memory/overview') {
              const moony = 读Moony();
              const 角色们 = 角色清单();
              const 当前 = String(moony.cwd ?? '');
              const 当前角色 = 角色们.find((r) => 当前.endsWith(sep + r.id) || 当前.endsWith('/' + r.id))?.id ?? '';
              发(200, {
                ok: true,
                version: 版本,
                roleRoot: 角色根(),
                moony: {
                  cwd: moony.cwd ?? '',
                  sessionId: moony.sessionId ?? '',
                  maxContextChars: moony.maxContextChars ?? 2000,
                  autoContext: moony.autoContext !== false,
                  personaLength: String(moony.persona ?? '').length,
                },
                当前角色,
                roles: 角色们,
                章程: 章程体检(),
              });
              return;
            }

            /* 注入预览 */
            if (req.method === 'GET' && 路径 === '/api/qq-memory/inject') {
              const 角色 = 查询.get('role') || '';
              const moony = 读Moony();
              发(200, { ok: true, ...注入预览(角色, moony) });
              return;
            }

            /* 章程 */
            if (req.method === 'GET' && 路径 === '/api/qq-memory/charter') {
              发(200, { ok: true, ...章程体检() });
              return;
            }

            /* 读一个文件 */
            if (req.method === 'GET' && 路径 === '/api/qq-memory/file') {
              const 角色 = 查询.get('role') || '';
              const 文件 = 查询.get('name') || '';
              const 内容 = 读文本(角色, 文件);
              发(200, { ok: true, role: 角色, name: 文件, content: 内容, length: 内容.length });
              return;
            }

            /* 写一个文件 */
            if (req.method === 'POST' && 路径 === '/api/qq-memory/file') {
              const 体 = JSON.parse(await 收集Body(req));
              const 结果 = 写文本(String(体?.role ?? ''), String(体?.name ?? ''), 体?.content);
              发(200, { ok: true, ...结果 });
              return;
            }

            /* FACTS 解析结果 */
            if (req.method === 'GET' && 路径 === '/api/qq-memory/facts') {
              const 角色 = 查询.get('role') || '';
              const 解析 = 解析FACTS(读文本(角色, 'FACTS.md'));
              发(200, { ok: true, role: 角色, ...解析 });
              return;
            }

            /* FACTS 整体写回 */
            if (req.method === 'POST' && 路径 === '/api/qq-memory/facts') {
              const 体 = JSON.parse(await 收集Body(req));
              const 条目们 = Array.isArray(体?.entries) ? 体.entries : [];
              const 结果 = 写回FACTS(String(体?.role ?? ''), 条目们);
              发(200, { ok: true, ...结果 });
              return;
            }

            /* 遗忘曲线整理 */
            if (req.method === 'POST' && 路径 === '/api/qq-memory/decay') {
              const 体 = JSON.parse(await 收集Body(req));
              const 每几天 = Math.max(1, Math.min(60, Number(体?.everyDays ?? 7)));
              const 删除线 = Math.max(0, Math.min(5, Number(体?.dropBelow ?? 1)));
              const 结果 = 遗忘整理(String(体?.role ?? ''), 每几天, 删除线);
              发(200, { ok: true, ...结果 });
              return;
            }

            /* 复习某条（关键字匹配） */
            if (req.method === 'POST' && 路径 === '/api/qq-memory/review') {
              const 体 = JSON.parse(await 收集Body(req));
              const 结果 = 复习(String(体?.role ?? ''), String(体?.keyword ?? ''));
              if (!结果.ok) {
                发(400, 结果);
                return;
              }
              发(200, 结果);
              return;
            }

            发(404, { ok: false, error: `未知路由：${req.method} ${路径}` });
          } catch (错) {
            const 消息 = String(错?.message ?? 错);
            const 是校验错 = /不合法|越界/.test(消息);
            发(是校验错 ? 400 : 500, { ok: false, error: 消息 });
          }
        },
      });
    });
  });
}
