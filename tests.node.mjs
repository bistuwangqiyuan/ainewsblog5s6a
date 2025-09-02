// Simple Node-based test runner (no npm test framework)
// Usage: set env PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, optional DEPLOY_URL, then: node tests.node.mjs

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEPLOY_URL = process.env.DEPLOY_URL || '';
const SUPA_URL = process.env.PUBLIC_SUPABASE_URL || '';
const SUPA_ANON = process.env.PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = SUPA_URL && SUPA_ANON ? createClient(SUPA_URL, SUPA_ANON) : null;

/**
 * Minimal test runner
 */
class Runner {
    constructor() {
        this.results = [];
    }
    async test(id, name, fn) {
        const res = { id, name, status: 'pass', details: '' };
        try {
            await fn();
        } catch (e) {
            res.status = 'fail';
            res.details = e && e.message ? e.message : String(e);
        }
        this.results.push(res);
        console.log(`${res.status === 'pass' ? '✓' : '✗'} ${id} ${name}${res.details ? ' — ' + res.details : ''}`);
    }
    async warn(id, name, cond, detailsIfWarn) {
        const res = { id, name, status: cond ? 'pass' : 'warn', details: cond ? '' : detailsIfWarn };
        this.results.push(res);
        console.log(`${res.status === 'pass' ? '✓' : '!'} ${id} ${name}${res.details ? ' — ' + res.details : ''}`);
    }
    async skip(id, name, reason) {
        const res = { id, name, status: 'skip', details: reason };
        this.results.push(res);
        console.log(`- ${id} ${name} (skip: ${reason})`);
    }
}

const r = new Runner();

// Build artifacts exist
await r.test('B1', 'dist/index.html 存在', async () => {
    const p = path.join(__dirname, 'dist', 'index.html');
    await fs.access(p);
});

const buildPages = ['about', 'ask', 'auth', 'community', 'feedback', 'image-cdn', 'messages', 'post', 'privacy', 'profile', 'submit', 'terms'];
for (const pg of buildPages) {
    await r.test(`B1.${pg}`, `dist/${pg}/index.html 存在`, async () => {
        const p = path.join(__dirname, 'dist', pg, 'index.html');
        await fs.access(p);
    });
}

// Supabase table existence checks
const tables = [
    'news_items',
    'posts',
    'comments',
    'likes',
    'favorites',
    'reports',
    'attachments',
    'feedback',
    'messages',
    'notifications',
    'profiles',
    'points_ledger',
    'user_levels'
];
if (!supabase) {
    await r.skip('S0', 'Supabase 连接', '缺少 PUBLIC_SUPABASE_URL 或 PUBLIC_SUPABASE_ANON_KEY');
} else {
    await r.test('S0', 'Supabase 连接可用', async () => {
        // Simple ping via anonymous RPC: list schemas by doing a light query
        const { error } = await supabase.from('news_items').select('id').limit(1);
        if (error) throw new Error(error.message);
    });
    for (const t of tables) {
        await r.test(`S1.${t}`, `存在表 ${t}`, async () => {
            const { error } = await supabase.from(t).select('*').limit(1);
            if (error) throw new Error(error.message);
        });
    }
    // Optional threshold check (24h fresh news)
    await r.warn(
        'S2',
        '近24小时 news_items 数量 ≥ 100',
        await (async () => {
            const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
            const { count, error } = await supabase.from('news_items').select('*', { count: 'exact', head: false }).gte('published_at', since);
            if (error) return false;
            return (count || 0) >= 100;
        })(),
        '数量未达 100（可能需等待定时任务积累或检查抓取源可用性）'
    );
}

// Remote deployed checks (if DEPLOY_URL provided)
if (!DEPLOY_URL) {
    await r.skip('R0', '远程站点首页可访问', '缺少 DEPLOY_URL');
    await r.skip('R1', 'crawler 函数可调用', '缺少 DEPLOY_URL');
    await r.skip('R2', 'aiProxy 函数可达（方法约束）', '缺少 DEPLOY_URL');
} else {
    await r.test('R0', '远程站点首页可访问', async () => {
        const res = await fetch(DEPLOY_URL, { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        if (!html.includes('最新 AI 编程资讯')) throw new Error('首页标识文本未出现');
    });
    await r.test('R1', 'crawler 函数可调用', async () => {
        const res = await fetch(new URL('/.netlify/functions/crawler', DEPLOY_URL), { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => ({}));
        if (typeof data.inserted !== 'number') throw new Error('返回体缺少 inserted 字段');
    });
    await r.test('R2', 'aiProxy 函数 GET 方法拒绝', async () => {
        const res = await fetch(new URL('/.netlify/functions/aiProxy', DEPLOY_URL), { method: 'GET' });
        if (res.status !== 405) throw new Error(`期望 405 实得 ${res.status}`);
    });
}

// Summarize
const summary = {
    generatedAt: new Date().toISOString(),
    deployUrl: DEPLOY_URL || null,
    supabaseUrl: SUPA_URL || null,
    passed: r.results.filter((x) => x.status === 'pass').length,
    failed: r.results.filter((x) => x.status === 'fail').length,
    warned: r.results.filter((x) => x.status === 'warn').length,
    skipped: r.results.filter((x) => x.status === 'skip').length,
    results: r.results
};

await fs.writeFile(path.join(__dirname, 'test-report.json'), JSON.stringify(summary, null, 2), 'utf-8');
console.log('\nTest summary:', JSON.stringify({ passed: summary.passed, failed: summary.failed, warned: summary.warned, skipped: summary.skipped }));

// Exit non-zero if any fail
if (summary.failed > 0) process.exit(1);
