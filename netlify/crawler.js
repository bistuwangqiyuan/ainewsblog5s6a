/**
 * 定时抓取资讯（Netlify Scheduled Function）
 * 每日抓取≥20源，各抓取 10-100 条，按 url 去重后 upsert 至 Supabase `news_items`
 */
import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
    const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const sources = buildSources();
    const items = [];
    for (const s of sources) {
        try {
            const list = await fetchSource(s);
            items.push(...list.map((x) => normalizeItem(x, s.name)));
        } catch (e) {
            // 记录但不中断整体任务
            console.error('source failed', s.name, e);
        }
    }
    // 去重 by url
    const uniq = new Map();
    for (const it of items) {
        if (it.url && !uniq.has(it.url)) uniq.set(it.url, it);
    }
    const all = Array.from(uniq.values());
    // 批量 upsert（按 200 条一批）
    const batchSize = 200;
    for (let i = 0; i < all.length; i += batchSize) {
        const batch = all.slice(i, i + batchSize);
        const { error } = await supabase.from('news_items').upsert(batch, { onConflict: 'url' });
        if (error) console.error('upsert error', error.message);
    }
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inserted: all.length }) };
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
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    const xml = await res.text();
    return parseRss(xml).slice(0, 100);
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
                summary: pick(it, 'description'),
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
