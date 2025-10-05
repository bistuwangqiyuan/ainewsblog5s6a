/**
 * 定时抓取资讯（Netlify Scheduled Function）
 * 每日抓取≥20源，各抓取 10-100 条，按 url 去重后 upsert 至 Supabase `news_items`
 */
import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
    const SUPA_URL = process.env.PUBLIC_SUPABASE_URL;
    const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPA_URL || !SUPA_SERVICE_KEY) {
        return json(500, {
            error: 'Supabase env missing',
            details: {
                PUBLIC_SUPABASE_URL: !!SUPA_URL,
                SUPABASE_SERVICE_ROLE_KEY: !!SUPA_SERVICE_KEY
            }
        });
    }

    const supabase = createClient(SUPA_URL, SUPA_SERVICE_KEY);
    const sources = buildSources();

    // 并发抓取（简单并发池）
    const concurrency = 8;
    const queue = sources.slice();
    const collected = [];
    async function worker() {
        while (queue.length) {
            const s = queue.shift();
            try {
                const list = await fetchSource(s);
                const normalized = list.map((x) => normalizeItem(x, s.name));
                collected.push(...normalized);
                await log(supabase, { source: s.name, status: 'ok', message: `fetched=${normalized.length}` });
            } catch (e) {
                const msg = e && e.message ? e.message : String(e);
                console.error('source failed', s.name, msg);
                await log(supabase, { source: s.name, status: 'error', message: msg.slice(0, 1000) });
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    // 去重 by url
    const uniq = new Map();
    for (const it of collected) {
        if (it.url && !uniq.has(it.url)) uniq.set(it.url, it);
    }
    const all = Array.from(uniq.values());

    // 批量 upsert（按 200 条一批）
    const batchSize = 200;
    let upsertErrors = 0;
    for (let i = 0; i < all.length; i += batchSize) {
        const batch = all.slice(i, i + batchSize);
        const { error } = await supabase.from('news_items').upsert(batch, { onConflict: 'url' });
        if (error) {
            upsertErrors++;
            console.error('upsert error', error.message);
            await log(supabase, { source: 'upsert', status: 'error', message: error.message.slice(0, 1000) });
        }
    }
    return json(200, { inserted: all.length, sources: sources.length, errors: upsertErrors });
}

function buildSources() {
    // 20 个来源（RSS 或 API）；示例使用公开 RSS 为主
    return [
        rss('arXiv AI', 'http://export.arxiv.org/rss/cs.AI'),
        rss('arXiv CL', 'http://export.arxiv.org/rss/cs.CL'),
        rss('arXiv LG', 'http://export.arxiv.org/rss/cs.LG'),
        rss('OpenAI Blog', 'https://openai.com/blog/rss.xml'),
        rss('DeepMind', 'https://deepmind.google/rss.xml'),
        rss('Google AI', 'https://ai.googleblog.com/atom.xml'),
        rss('Microsoft Research', 'https://www.microsoft.com/en-us/research/feed/'),
        rss('NVIDIA Blog AI', 'https://blogs.nvidia.com/blog/category/ai/feed/'),
        rss('Meta AI', 'https://ai.facebook.com/blog/rss/'),
        rss('Anthropic', 'https://www.anthropic.com/news.atom'),
        rss('Hugging Face', 'https://huggingface.co/blog/feed.xml'),
        rss('Stability AI', 'https://stability.ai/blog/rss.xml'),
        rss('AWS ML', 'https://aws.amazon.com/blogs/machine-learning/feed/'),
        rss('Azure AI', 'https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?board=AzureAI'),
        rss('InfoQ AI', 'https://feed.infoq.com/ai-ml-data-eng'),
        rss('VentureBeat AI', 'https://venturebeat.com/category/ai/feed/'),
        rss('TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/'),
        rss('The Gradient', 'https://thegradient.pub/rss/'),
        rss('dev.to AI', 'https://dev.to/feed/tag/ai'),
        rss('HN AI', 'https://hnrss.org/newest?q=ai%20programming')
    ];
}

function rss(name, url) {
    return { type: 'rss', name, url };
}

async function fetchSource(s) {
    if (s.type === 'rss') return fetchRss(s.url);
    return [];
}

async function fetchRss(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(url, {
            headers: {
                'user-agent': 'Mozilla/5.0',
                accept: 'application/rss+xml, application/atom+xml, text/xml;q=0.9, */*;q=0.1'
            },
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        return parseRss(xml).slice(0, 100);
    } finally {
        clearTimeout(timer);
    }
}

function parseRss(xml) {
    // 朴素解析（不引第三方库），适配常见 RSS/Atom
    const items = [];
    const entries = xml
        .split('<item>')
        .slice(1)
        .map((x) => x.split('</item>')[0]);
    if (entries.length > 0) {
        for (const it of entries) {
            items.push({
                title: pick(it, 'title'),
                summary: pick(it, 'description') || pickNs(it, 'content:encoded'),
                url: pick(it, 'link'),
                published_at: pick(it, 'pubDate') || new Date().toISOString()
            });
        }
    } else {
        // Atom
        const ents = xml
            .split('<entry>')
            .slice(1)
            .map((x) => x.split('</entry>')[0]);
        for (const it of ents) {
            items.push({
                title: pick(it, 'title'),
                summary: pick(it, 'summary'),
                url: pickAttr(it, 'link', 'href'),
                published_at: pick(it, 'updated') || new Date().toISOString()
            });
        }
    }
    return items;
}

function pick(block, tag) {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i'));
    return m ? decode(strip(m[1])) : '';
}

function pickAttr(block, tag, attr) {
    const m = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"[^>]*>`, 'i'));
    return m ? decode(m[1]) : '';
}

function pickNs(block, tagWithNs) {
    // 解析带命名空间的标签，例如 content:encoded
    const safe = tagWithNs.replace(/[:]/g, '\\:');
    const m = block.match(new RegExp(`<${safe}[^>]*>([\s\S]*?)<\/${safe}>`, 'i'));
    return m ? decode(strip(m[1])) : '';
}

function strip(html) {
    return html.replace(/<[^>]+>/g, '').trim();
}
function decode(s) {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function normalizeItem(x, sourceName) {
    return {
        title: x.title?.slice(0, 300) || null,
        summary: x.summary?.slice(0, 1000) || null,
        content: null,
        url: x.url,
        source: sourceName,
        tags: null,
        published_at: x.published_at ? new Date(x.published_at).toISOString() : new Date().toISOString(),
        created_at: new Date().toISOString(),
        score: null
    };
}

async function log(supabase, row) {
    try {
        await supabase.from('crawler_logs').insert({
            source: row.source || null,
            status: row.status || null,
            message: row.message || null
        });
    } catch (_) {
        // 忽略日志写入失败
    }
}

function json(status, body) {
    return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
