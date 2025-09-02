/**
 * AI 代理函数（Netlify Function）
 * 功能：根据 provider 路由到不同 AI 厂商；失败直接返回错误，不做降级/伪造
 * 入参：POST JSON { provider?: 'deepseek'|'glm'|'moonshot'|'tongyi'|'tengcent'|'spark'|'doubao'|'minimax', model?: string, messages: Array<{role:string, content:string}> }
 * 返回：上游原样数据或标准错误
 */
export async function handler(event) {
    if (event.httpMethod !== 'POST') {
        return resp(405, { error: 'Method Not Allowed' });
    }
    try {
        const body = JSON.parse(event.body || '{}');
        const provider = (body.provider || process.env.AI_PROVIDER || 'deepseek').toLowerCase();
        const messages = body.messages || [];
        if (!Array.isArray(messages) || messages.length === 0) {
            return resp(400, { error: 'messages required' });
        }
        const routes = {
            deepseek: {
                url: 'https://api.deepseek.com/chat/completions',
                key: process.env.DEEPSEEK_API_KEY,
                map: (b) => ({ model: body.model || 'deepseek-chat', messages })
            },
            glm: {
                url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                key: process.env.GLM_API_KEY,
                map: (b) => ({ model: body.model || 'glm-4', messages })
            },
            moonshot: {
                url: 'https://api.moonshot.cn/v1/chat/completions',
                key: process.env.MOONSHOT_API_KEY,
                map: (b) => ({ model: body.model || 'moonshot-v1-8k', messages })
            },
            tongyi: {
                url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
                key: process.env.TONGYI_API_KEY,
                map: (b) => ({ model: body.model || 'qwen-turbo', messages })
            },
            tengcent: {
                url: 'https://hailuoai.tencent.com/v1/chat/completions',
                key: process.env.TENGCENT_API_KEY,
                map: (b) => ({ model: body.model || 'gpt-turbo', messages })
            },
            spark: {
                url: 'https://spark-api.xf-yun.com/v1/chat/completions',
                key: process.env.SPARK_API_KEY,
                map: (b) => ({ model: body.model || 'spark-3.5', messages })
            },
            doubao: {
                url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
                key: process.env.DOUBAO_API_KEY,
                map: (b) => ({ model: body.model || 'ep-32k', messages })
            },
            minimax: {
                url: 'https://api.minimax.chat/v1/text/chatcompletion',
                key: process.env.MINIMAX_API_KEY,
                map: (b) => ({ model: body.model || 'abab6.5-chat', messages })
            }
        };

        const r = routes[provider];
        if (!r || !r.key) {
            return resp(400, { error: `provider invalid or key missing: ${provider}` });
        }
        const upstream = await fetch(r.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${r.key}`
            },
            body: JSON.stringify(r.map(body))
        });
        const text = await upstream.text();
        const ctype = upstream.headers.get('content-type') || 'application/json';
        return {
            statusCode: upstream.status,
            headers: { 'content-type': ctype },
            body: text
        };
    } catch (e) {
        return resp(500, { error: String(e?.message || e) });
    }
}

function resp(status, obj) {
    return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) };
}
