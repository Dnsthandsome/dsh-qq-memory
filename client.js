window.__ModuleLoader__.load({
  id: 'dsh-qq-memory',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const 卡片 = {
      border: '1px solid var(--dsw-alias-border-2, rgba(127,127,127,0.25))',
      borderRadius: '12px',
      padding: '14px 16px',
      marginBottom: '12px',
    };
    const 标题 = { fontSize: '14px', fontWeight: 600, marginBottom: '6px' };
    const 说明 = { fontSize: '12px', opacity: 0.65, lineHeight: '18px' };
    const 小字 = { fontSize: '11px', opacity: 0.55 };
    const 输入 = {
      width: '100%',
      boxSizing: 'border-box',
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '12px',
      lineHeight: '18px',
      padding: '10px',
      borderRadius: '8px',
      border: '1px solid var(--dsw-alias-border-2, rgba(127,127,127,0.35))',
      background: 'var(--dsw-alias-bg-2, rgba(127,127,127,0.06))',
      color: 'inherit',
      resize: 'vertical',
    };
    const 按钮 = {
      fontSize: '12px',
      padding: '6px 12px',
      borderRadius: '8px',
      border: '1px solid var(--dsw-alias-border-2, rgba(127,127,127,0.35))',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
    };
    const 主按钮 = {
      ...按钮,
      background: 'var(--dsw-alias-accent-1, #4d8dff)',
      borderColor: 'var(--dsw-alias-accent-1, #4d8dff)',
      color: '#fff',
      fontWeight: 600,
    };
    const 徽 = {
      display: 'inline-block',
      fontSize: '11px',
      padding: '1px 7px',
      borderRadius: '999px',
      border: '1px solid var(--dsw-alias-border-2, rgba(127,127,127,0.35))',
      marginLeft: '6px',
      opacity: 0.8,
    };

    async function 取(路径, 选项) {
      const r = await fetch(路径, 选项);
      const j = await r.json().catch(() => ({ ok: false, error: '返回不是 JSON' }));
      return j;
    }

    function 面板() {
      const [总览, 设总览] = React.useState(null);
      const [角色, 设角色] = React.useState('');
      const [文件, 设文件] = React.useState('MEMORY.md');
      const [内容, 设内容] = React.useState('');
      const [原文, 设原文] = React.useState('');
      const [事实, 设事实] = React.useState(null);
      const [注入, 设注入] = React.useState(null);
      const [提示, 设提示] = React.useState('');
      const [错, 设错] = React.useState('');
      const [忙, 设忙] = React.useState(false);
      const [改动, 设改动] = React.useState(false);

      const 刷新总览 = React.useCallback(async () => {
        const j = await 取('/api/qq-memory/overview');
        if (!j.ok) {
          设错(j.error || '读总览失败');
          return;
        }
        设总览(j);
        设角色((前) => 前 || j.当前角色 || (j.roles[0]?.id ?? ''));
      }, []);

      React.useEffect(() => {
        刷新总览().catch((e) => 设错(String(e)));
      }, [刷新总览]);

      const 读文件 = React.useCallback(async (r, n) => {
        if (!r || !n) return;
        const j = await 取(`/api/qq-memory/file?role=${encodeURIComponent(r)}&name=${encodeURIComponent(n)}`);
        if (!j.ok) {
          设错(j.error || '读文件失败');
          return;
        }
        设内容(j.content || '');
        设原文(j.content || '');
        设改动(false);
        设错('');
        if (n === 'FACTS.md') {
          const f = await 取(`/api/qq-memory/facts?role=${encodeURIComponent(r)}`);
          if (f.ok) 设事实(f);
        } else {
          设事实(null);
        }
      }, []);

      React.useEffect(() => {
        if (角色 && 文件) 读文件(角色, 文件).catch((e) => 设错(String(e)));
      }, [角色, 文件, 读文件]);

      React.useEffect(() => {
        if (!角色) return;
        取(`/api/qq-memory/inject?role=${encodeURIComponent(角色)}`)
          .then((j) => j.ok && 设注入(j))
          .catch(() => {});
      }, [角色, 内容]);

      const 保存 = async () => {
        设忙(true);
        设提示('');
        try {
          const j = await 取('/api/qq-memory/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 角色, name: 文件, content: 内容 }),
          });
          if (!j.ok) 设错(j.error || '保存失败');
          else {
            设提示('已保存（moony 下一轮就吃新的）');
            设原文(内容);
            设改动(false);
            刷新总览();
          }
        } catch (e) {
          设错(String(e));
        } finally {
          设忙(false);
        }
      };

      const 遗忘 = async () => {
        if (!window.confirm('按遗忘曲线整理 FACTS.md？\n规则：每 7 天没被回忆 → 降 1 权；权 < 1 → 删除。')) return;
        设忙(true);
        try {
          const j = await 取('/api/qq-memory/decay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 角色, everyDays: 7, dropBelow: 1 }),
          });
          if (!j.ok) 设错(j.error || '整理失败');
          else {
            设提示(j.变化.length ? `整理完成：${j.变化.map((x) => `${x.动作} ${x.旧权}→${x.新权}`).join('，')}` : '整理完成：没有需要降权的条目');
            读文件(角色, 'FACTS.md');
            刷新总览();
          }
        } catch (e) {
          设错(String(e));
        } finally {
          设忙(false);
        }
      };

      const 复习一条 = async (关键字) => {
        设忙(true);
        try {
          const j = await 取('/api/qq-memory/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 角色, keyword: 关键字 }),
          });
          if (!j.ok) 设错(j.error || '复习失败');
          else {
            设提示(`复习了 ${j.命中.length} 条，权重 +1、日期更新为今天`);
            读文件(角色, 'FACTS.md');
          }
        } catch (e) {
          设错(String(e));
        } finally {
          设忙(false);
        }
      };

      if (!总览) {
        return h('div', { style: { padding: '8px 0', opacity: 0.6 } }, 错 || '读记忆系统中…');
      }

      const 角色们 = 总览.roles || [];
      const 当前 = 角色们.find((r) => r.id === 角色);
      const 文件们 = 当前?.files || [];
      const 章程 = 总览.章程 || {};

      const 角色按钮们 = 角色们.map((r) =>
        h(
          'button',
          {
            key: r.id,
            type: 'button',
            onClick: () => {
              设角色(r.id);
              设文件('MEMORY.md');
              设提示('');
            },
            style: {
              ...按钮,
              marginRight: '6px',
              marginBottom: '6px',
              background: r.id === 角色 ? 'var(--dsw-alias-accent-1, #4d8dff)' : 'transparent',
              borderColor:
                r.id === 角色 ? 'var(--dsw-alias-accent-1, #4d8dff)' : 'var(--dsw-alias-border-2, rgba(127,127,127,0.35))',
              color: r.id === 角色 ? '#fff' : 'inherit',
              fontWeight: r.id === 角色 ? 600 : 400,
            },
          },
          `${r.id}${总览.当前角色 === r.id ? ' · 在跑' : ''}`,
        ),
      );

      const 文件按钮们 = 文件们.map((f) =>
        h(
          'button',
          {
            key: f.name,
            type: 'button',
            onClick: () => 设文件(f.name),
            style: {
              ...按钮,
              marginRight: '6px',
              marginBottom: '6px',
              fontSize: '11px',
              background: f.name === 文件 ? 'var(--dsw-alias-accent-1, #4d8dff)' : 'transparent',
              borderColor:
                f.name === 文件 ? 'var(--dsw-alias-accent-1, #4d8dff)' : 'var(--dsw-alias-border-2, rgba(127,127,127,0.35))',
              color: f.name === 文件 ? '#fff' : 'inherit',
            },
          },
          `${f.name}${f.kind === '日记' ? ' 📔' : ''}`,
        ),
      );

      const 事实行们 = (事实?.条目 || []).map((e, i) =>
        h(
          'div',
          {
            key: `${e.行号}-${i}`,
            style: {
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '7px 0',
              borderBottom: '1px solid var(--dsw-alias-border-2, rgba(127,127,127,0.18))',
            },
          },
          h(
            'div',
            {
              style: {
                flex: '0 0 34px',
                fontSize: '12px',
                fontWeight: 700,
                textAlign: 'center',
                borderRadius: '6px',
                padding: '2px 0',
                background:
                  e.w >= 8
                    ? 'rgba(255,117,0,0.16)'
                    : e.w >= 5
                      ? 'rgba(77,141,255,0.14)'
                      : 'rgba(127,127,127,0.14)',
              },
            },
            String(e.w),
          ),
          h(
            'div',
            { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { fontSize: '12px', lineHeight: '18px', wordBreak: 'break-word' } }, e.text),
            h('div', { style: 小字 }, `最近回忆 ${e.d || '未记'}`),
          ),
          h(
            'button',
            {
              type: 'button',
              disabled: Boolean(忙),
              onClick: () => 复习一条(e.text.slice(0, 12)),
              style: { ...按钮, fontSize: '11px', padding: '3px 8px' },
            },
            '复习 +1',
          ),
        ),
      );

      const 注入片段们 = (注入?.片段 || []).map((s) =>
        h(
          'div',
          { key: s.文件, style: { fontSize: '11px', lineHeight: '17px', display: 'flex', gap: '8px' } },
          h('span', { style: { flex: '0 0 150px', opacity: 0.7 } }, s.文件),
          h('span', null, `${s.实际注入} 字${s.被截断 ? `（原文 ${s.全文长} 字，被截断）` : ''}`),
        ),
      );

      return h(
        'div',
        null,
        /* ── 概览 ── */
        h(
          'div',
          { style: 卡片 },
          h('div', { style: 标题 }, '记忆管理'),
          h(
            'div',
            { style: 说明 },
            `机器人每轮自动吃：MEMORY.md + 当天日记（截断到 ${总览.moony.maxContextChars} 字）。FACTS/REFLECT 不自动吃，它自己按需 read。这里改文件即刻生效——moony 每轮现读磁盘。`,
          ),
          h(
            'div',
            { style: { ...说明, marginTop: '6px' } },
            `角色根：${总览.roleRoot}`,
            h('span', { style: 徽 }, `正在跑：${总览.当前角色 || '未知'}`),
            h('span', { style: 徽 }, `会话：${总览.moony.sessionId || '—'}`),
            h('span', { style: 徽 }, `人设 ${总览.moony.personaLength} 字`),
          ),
          h(
            'div',
            { style: { ...说明, marginTop: '6px' } },
            章程.在
              ? `✅ persona 里的【自我记忆管理系统】还在（${章程.长度} 字）`
              : '⚠️ persona 里找不到【自我记忆管理系统】章程，机器人不会自己维护记忆',
          ),
        ),

        /* ── 角色 ── */
        h(
          'div',
          { style: 卡片 },
          h('div', { style: 标题 }, '选角色'),
          h('div', null, 角色按钮们),
        ),

        /* ── 注入预览 ── */
        h(
          'div',
          { style: 卡片 },
          h('div', { style: 标题 }, '这一轮实际注入'),
          h(
            'div',
            { style: 说明 },
            `${角色} · 已用 ${注入?.已用 ?? 0} / ${注入?.预算总 ?? 0} 字（${注入?.占用比 ?? 0}%）`,
          ),
          h(
            'div',
            {
              style: {
                height: '6px',
                borderRadius: '3px',
                background: 'rgba(127,127,127,0.2)',
                margin: '8px 0 10px',
                overflow: 'hidden',
              },
            },
            h('div', {
              style: {
                width: `${Math.min(100, 注入?.占用比 ?? 0)}%`,
                height: '100%',
                background: (注入?.占用比 ?? 0) > 95 ? '#ff5d5d' : 'var(--dsw-alias-accent-1, #4d8dff)',
              },
            }),
          ),
          h('div', null, 注入片段们),
        ),

        /* ── 文件 ── */
        h(
          'div',
          { style: 卡片 },
          h('div', { style: 标题 }, '记忆文件'),
          h('div', null, 文件按钮们),
          h('textarea', {
            value: 内容,
            onChange: (e) => {
              设内容(e.target.value);
              设改动(e.target.value !== 原文);
            },
            spellCheck: false,
            style: { ...输入, minHeight: '260px' },
          }),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' } },
            h('button', { type: 'button', onClick: 保存, disabled: Boolean(忙) || !改动, style: 主按钮 }, 忙 ? '保存中…' : '保存'),
            h(
              'button',
              {
                type: 'button',
                onClick: () => {
                  设内容(原文);
                  设改动(false);
                },
                disabled: !改动,
                style: 按钮,
              },
              '撤销改动',
            ),
            h('span', { style: 小字 }, `${内容.length} 字${改动 ? ' · 有未保存改动' : ''}`),
          ),
        ),

        /* ── FACTS 权重 ── */
        事实
          ? h(
              'div',
              { style: 卡片 },
              h('div', { style: 标题 }, '加权事实（FACTS.md）'),
              h(
                'div',
                { style: 说明 },
                `${事实.统计.条数} 条 · 均权 ${事实.统计.均权} · 核心(w≥8) ${事实.统计.核心} 条 · 观察(w≤4) ${事实.统计.观察} 条`,
              ),
              h(
                'div',
                { style: { display: 'flex', gap: '8px', margin: '10px 0' } },
                h('button', { type: 'button', onClick: 遗忘, disabled: Boolean(忙), style: 按钮 }, '按遗忘曲线整理'),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => 读文件(角色, 'FACTS.md'),
                    disabled: Boolean(忙),
                    style: 按钮,
                  },
                  '刷新',
                ),
              ),
              h('div', null, 事实行们),
              h(
                'div',
                { style: { ...说明, marginTop: '8px' } },
                '「复习 +1」= 把这条的 d 改成今天、权重 +1（封顶 10）。整理规则：每 7 天没被回忆 → 降 1 权，权 < 1 删除。',
              ),
            )
          : null,

        提示 ? h('div', { style: { ...说明, marginTop: '8px' } }, 提示) : null,
        错
          ? h('div', { style: { ...说明, color: 'var(--dsw-alias-danger-1, #ff5d5d)', marginTop: '8px' } }, 错)
          : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'qq-memory', order: 32, label: '记忆管理' },
            面板,
          ),
        );
      },
    };
  },
});
