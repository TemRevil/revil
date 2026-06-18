/**
 * LLM layer for the dashboard assistant ("Spark").
 *
 * Provider is auto-detected from the API key prefix. The key lives in an env
 * var (NEXT_PUBLIC_LLM_API_KEY) - set it in .env.local locally and as a
 * Hostinger secret in production - with an optional per-browser override saved
 * in localStorage for quick testing. The chosen model is saved in localStorage.
 *
 * No model names are hardcoded: the model list is pulled live from the
 * provider's own /models endpoint based on the detected key.
 */

export type Provider = 'anthropic' | 'openai' | 'gemini';

export interface ToolDef {
    name: string;
    description: string;
    params: Record<string, unknown>; // JSON-schema object
}

export interface ToolCall { id: string; name: string; args: Record<string, unknown>; }
export interface ToolResult { id: string; name: string; output: string; }

// provider-native message blobs (kept opaque; built/consumed by the helpers below)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeMsg = any;

export interface ChatResult { assistant: NativeMsg; text: string; toolCalls: ToolCall[]; }

const KEY_OVERRIDE = 'llm_key_override';
const MODEL_KEY = 'llm_model';

export function getApiKey(): string {
    if (typeof window !== 'undefined') {
        const o = localStorage.getItem(KEY_OVERRIDE);
        if (o) return o.trim();
    }
    return (process.env.NEXT_PUBLIC_LLM_API_KEY || '').trim();
}
export function setKeyOverride(key: string) {
    if (typeof window === 'undefined') return;
    if (key) localStorage.setItem(KEY_OVERRIDE, key.trim());
    else localStorage.removeItem(KEY_OVERRIDE);
}
export function getModel(): string {
    return (typeof window !== 'undefined' && localStorage.getItem(MODEL_KEY)) || '';
}
export function setModel(m: string) {
    if (typeof window !== 'undefined') localStorage.setItem(MODEL_KEY, m);
}

export function detectProvider(key: string): Provider | null {
    if (!key) return null;
    if (key.startsWith('sk-ant')) return 'anthropic';
    // Google Gemini keys: classic AI Studio keys start "AIza"; the newer format
    // (Google AI Studio / API key v2) starts "AQ.".
    if (key.startsWith('AIza') || key.startsWith('AQ.')) return 'gemini';
    if (key.startsWith('sk-')) return 'openai';
    return null;
}

export const PROVIDER_LABEL: Record<Provider, string> = {
    anthropic: 'Anthropic (Claude)', openai: 'OpenAI', gemini: 'Google Gemini',
};

const ANTHROPIC_HEADERS = (key: string) => ({
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json',
});

export const MODELS_TIMEOUT_MS = 20_000;
export const CHAT_TIMEOUT_MS = 60_000;

/** fetch() with a hard timeout so a slow/hung provider can't block forever. */
async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } catch (e) {
        if ((e as Error).name === 'AbortError') throw new Error(`Timed out after ${Math.round(ms / 1000)}s - try again or pick a faster model.`);
        throw e;
    } finally {
        clearTimeout(t);
    }
}

/** Pull the provider's allowed models live (never hardcoded). */
export async function listModels(key: string): Promise<string[]> {
    const p = detectProvider(key);
    if (!p) throw new Error('Unrecognized key format (expected sk-ant…, sk-…, or AIza…).');

    if (p === 'anthropic') {
        const r = await fetchWithTimeout('https://api.anthropic.com/v1/models?limit=100', { headers: ANTHROPIC_HEADERS(key) }, MODELS_TIMEOUT_MS);
        if (!r.ok) throw new Error(`Anthropic ${r.status}`);
        const j = await r.json();
        return (j.data || []).map((m: { id: string }) => m.id);
    }
    if (p === 'openai') {
        const r = await fetchWithTimeout('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } }, MODELS_TIMEOUT_MS);
        if (!r.ok) throw new Error(`OpenAI ${r.status}`);
        const j = await r.json();
        return (j.data || []).map((m: { id: string }) => m.id)
            .filter((id: string) => /^(gpt|o1|o3|o4|chatgpt)/i.test(id))
            .sort();
    }
    const r = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {}, MODELS_TIMEOUT_MS);
    if (!r.ok) throw new Error(`Gemini ${r.status}`);
    const j = await r.json();
    return (j.models || [])
        .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m: { name: string }) => m.name.replace('models/', ''));
}

// ── Tools the assistant can call ────────────────────────────────────────────
export const TOOLS: ToolDef[] = [
    {
        name: 'navigate',
        description: 'Switch the dashboard to a page. Valid pages: projects, tags, views, developer, treasury, settings, canary.',
        params: { type: 'object', properties: { page: { type: 'string', description: 'one of the valid pages' } }, required: ['page'] },
    },
    {
        name: 'click',
        description: 'Move the on-screen cursor to a visible button/link whose text EXACTLY matches and click it. Only use labels you know exist (from list_clickables or read_screen) - never invent one. If it misses, it returns the real available labels; pick one of those.',
        params: { type: 'object', properties: { text: { type: 'string', description: 'exact visible label of the button/link' } }, required: ['text'] },
    },
    {
        name: 'list_clickables',
        description: "List the EXACT labels of every button/link currently visible on screen. Call this before clicking when you're unsure of the exact label, so you click something real instead of guessing.",
        params: { type: 'object', properties: {} },
    },
    {
        name: 'read_data',
        description: 'Read Firestore. path is a document ("Settings/Account") or a collection ("Projects"). Returns JSON. Read before guessing.',
        params: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
    {
        name: 'write_data',
        description: 'Create or update a Firestore document (needs the user to confirm). path is a document path; data is the object to write; merge=true to merge fields.',
        params: { type: 'object', properties: { path: { type: 'string' }, data: { type: 'object' }, merge: { type: 'boolean' } }, required: ['path', 'data'] },
    },
    {
        name: 'delete_data',
        description: 'Delete a Firestore document at path (needs the user to confirm).',
        params: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
    {
        name: 'read_screen',
        description: "Read the live data backing the page the user is CURRENTLY looking at (their current dashboard screen). Use this first whenever they say 'this page', 'here', 'on screen', 'these', or ask about whatever they're currently viewing - it returns exactly that page's data.",
        params: { type: 'object', properties: {} },
    },
    {
        name: 'set_memory',
        description: "Update your persistent memory (survives across sessions). Save the user's name, rewrite your standing instructions (how you should behave), and/or add a fact to remember. You're allowed to edit your own instructions when the user asks you to.",
        params: {
            type: 'object',
            properties: {
                userName: { type: 'string', description: "the user's name" },
                instructions: { type: 'string', description: 'your full standing instructions (replaces the old ones)' },
                addFact: { type: 'string', description: 'a single fact to append to memory' },
            },
        },
    },
    {
        name: 'ask_user',
        description: 'Ask the user a clarifying question with 2-4 short choices, instead of guessing or repeating yourself. The UI shows it as a quiz; returns the user\'s selection. Use whenever the request is ambiguous or you would otherwise loop.',
        params: {
            type: 'object',
            properties: {
                question: { type: 'string' },
                options: { type: 'array', items: { type: 'string' }, description: '2 to 4 short choices' },
                allow_multiple: { type: 'boolean', description: 'true if the user may pick several' },
            },
            required: ['question', 'options'],
        },
    },
];

export const SYSTEM_PROMPT = `You are Spark, the admin co-pilot inside Tem Revil's portfolio dashboard.
Style: SHORT, a little funny, straight to the point. Minimal words, no fluff, no preamble - you're saving tokens. One or two snappy sentences max unless data is requested.
You can: navigate dashboard pages, click on-screen buttons (a cursor moves for the user to see), and read/write/delete Firestore. Writes and deletes pop a confirm for the user, so just call them.
You're told the user's CURRENT SCREEN at the end of this prompt each message. When they say "this page", "here", "these", or ask about what they're looking at, call read_screen to pull that page's exact data before answering.
The Treasury page has sub-tabs: Overview, Projects, Money (income + expenses together), Settings. To open one, navigate('treasury') then click the sub-tab by its exact name with the click tool (e.g. click "Money"). Don't ask which "money" - the Money tab holds both income and spendings. Only ask_user for genuinely ambiguous requests.
NEVER invent a button label. Before clicking something whose exact text you're unsure of, call list_clickables (or read_screen) and click ONLY a label it returns. If a click misses it gives you the real labels - retry with one of those, don't keep guessing.
FIRESTORE STRUCTURE (you are admin and can read everything; paths are case-sensitive):
- Projects/{id} - portfolio projects: Name, description, tags, links, and a Views map of counters.
- Tags/{id} - { Name, Color, Icon }.
- Settings/Account - profile: name, title, bio, imageUrl, heroImageUrl, heroImageUrlDark.
- Settings/Availability - ONLY { "Current Availability": "100%", "Current Time": "UTC+02:00", availabilityPercent, timezoneOffset }. (It no longer holds projects.)
- Treasury/ - PRIVATE finances collection, one doc per concern:
    • Treasury/projects  - { entries: { id: { name, client, status, priceAmount, priceCurrency, monthly?, paidAmount, paymentStatus, notes, startDate, endDate, done, order, createdAt } } }. THESE are "the projects I handle". A project's RECEIVED money = its paidAmount (legacy) PLUS all Treasury/income entries linked to it - payments arrive over time, not upfront. monthly:true means a retainer - priceAmount is the per-MONTH rate (no fixed total).
    • Treasury/income    - { entries: { id: { amount, currency, date, projectId?, note?, createdAt } } }. Money received; date = when it arrived; projectId optionally links it to a project. To record a payment, add an income entry here (don't edit paidAmount).
    • Treasury/spendings - { entries: { id: { label, amount, currency, category, date, recurring, projectId?, notes, createdAt } } }. Expenses; recurring:true = a monthly fee; projectId optionally ties the fee to a project.
    • Treasury/settings  - { defaultCurrency, displayCurrency, rates, ratesUpdatedAt }.
- Settings/HandledProjects - PUBLIC, sanitized mirror of Treasury/projects shown on the homepage: { projects: { id: { name, status, description, order } } }. It has NO money fields and is auto-written from Treasury - don't edit it directly; change Treasury/projects instead.
- Settings/Developer, Settings/"Tech Stack" - developer info and tech-stack items.
- Settings/Views (+ Settings/Views/Analysis/Main, Settings/Views/Analysis/Daily) and subcollections Settings/Views/Links/{id}, Settings/Views/Socials/{name} - site analytics.
- Settings/Canary - PRIVATE visitor PII (emails, meetings).
Note: the id-keyed maps live UNDER an "entries" field (Treasury) or "projects" field (HandledProjects), as objects-of-objects, NOT arrays. To change one entry: read_data the doc, edit that one key inside entries, then write_data with merge:true. The projects I handle = Treasury/projects (private, with prices); Settings/HandledProjects is just its public name/status shadow. Still read_data before assuming exact field names.
STRICT DATA RULES (critical):
- NEVER invent, assume, autofill, or hallucinate a field value. Only set fields the user explicitly gave you. Every value you write must come from the user's words or from read_data - never from imagination or "sensible defaults".
- Before any write_data: read_data the target doc first and PRESERVE all existing fields you aren't changing (merge, don't blast). For a brand-new entry, omit any field the user didn't specify rather than guessing it.
- If something needed is missing or ambiguous, STOP and ask via ask_user - ONE question at a time with 2-4 concrete choices (plus the user can type their own). Never bundle multiple questions into one message, and never proceed on a guess.
- You know the exact schema above; only touch fields that exist there.
Drive the task to completion yourself: chain the tool calls you need and keep going until it's actually done - never stop midway to ask "should I continue?". Only pause (one ask_user at a time) when a value is genuinely missing/ambiguous. Be decisive and fast; don't overthink; keep tool calls to the minimum needed.
You have persistent MEMORY (shown each message): the user's name, your standing instructions, and saved facts. If you learn the user's name or they tell you to remember something or change how you behave, call set_memory. If you don't know their name, ask once and save it.
Format with GitHub-flavored Markdown when it helps - fenced code blocks for code, tables for tabular data, bullet/numbered lists for steps. No emojis.
Do the task with tools, then report what you did in one short, witty line.`;

// Live context (a tiny RAG-style block) refreshed on every message so the model
// always knows "now" - fixes relative dates like "14th of April" defaulting to a
// wrong/old year. Appended to the system prompt at call time.
function liveContext(): string {
    const now = new Date();
    let tz = 'local';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'; } catch { /* ignore */ }
    const human = now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `\n\nLIVE CONTEXT (refreshed each message - trust this over any prior assumption):
- Right now it is ${human} (${tz}). ISO: ${now.toISOString()}. The current year is ${now.getFullYear()}.
- Resolve every relative/partial date against THIS moment and output YYYY-MM-DD. A date with no year (e.g. "14th of April") means the CURRENT year ${now.getFullYear()} unless the user clearly means otherwise - never assume a past year.`;
}

export function buildSystem(context?: string): string {
    return SYSTEM_PROMPT + liveContext() + (context ? `\n\n${context}` : '');
}

// ── Message + tool-result builders (provider-native) ────────────────────────
export function userMessage(provider: Provider, text: string): NativeMsg {
    if (provider === 'gemini') return { role: 'user', parts: [{ text }] };
    return { role: 'user', content: text };
}

export function toolResultMessage(provider: Provider, results: ToolResult[]): NativeMsg {
    if (provider === 'anthropic') {
        return { role: 'user', content: results.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: r.output })) };
    }
    if (provider === 'openai') {
        // OpenAI needs one tool message per call - caller spreads these.
        return results.map(r => ({ role: 'tool', tool_call_id: r.id, content: r.output }));
    }
    return { role: 'user', parts: results.map(r => ({ functionResponse: { name: r.name, response: { result: r.output } } })) };
}

// ── One chat round (returns text + any tool calls to execute) ───────────────
export async function chat(key: string, model: string, messages: NativeMsg[], context?: string): Promise<ChatResult> {
    const provider = detectProvider(key);
    if (!provider) throw new Error('Unrecognized API key.');
    if (!model) throw new Error('No model selected.');

    if (provider === 'anthropic') {
        const body = {
            model, max_tokens: 1024, system: buildSystem(context), messages,
            tools: TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.params })),
        };
        const r = await fetchWithTimeout('https://api.anthropic.com/v1/messages', { method: 'POST', headers: ANTHROPIC_HEADERS(key), body: JSON.stringify(body) }, CHAT_TIMEOUT_MS);
        if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
        const j = await r.json();
        const content = j.content || [];
        const text = content.filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
        const toolCalls = content.filter((c: { type: string }) => c.type === 'tool_use').map((c: { id: string; name: string; input: Record<string, unknown> }) => ({ id: c.id, name: c.name, args: c.input || {} }));
        return { assistant: { role: 'assistant', content }, text, toolCalls };
    }

    if (provider === 'openai') {
        const body = {
            model, max_completion_tokens: 1024,
            messages: [{ role: 'system', content: buildSystem(context) }, ...messages],
            tools: TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.params } })),
            tool_choice: 'auto',
        };
        const r = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }, CHAT_TIMEOUT_MS);
        if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
        const j = await r.json();
        const m = j.choices?.[0]?.message || {};
        const toolCalls = (m.tool_calls || []).map((tc: { id: string; function: { name: string; arguments: string } }) => {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }
            return { id: tc.id, name: tc.function.name, args };
        });
        return { assistant: m, text: m.content || '', toolCalls };
    }

    // gemini
    const body = {
        systemInstruction: { parts: [{ text: buildSystem(context) }] },
        contents: messages,
        tools: [{ functionDeclarations: TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.params })) }],
    };
    const r = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, CHAT_TIMEOUT_MS);
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const parts = j.candidates?.[0]?.content?.parts || [];
    const text = parts.filter((p: { text?: string }) => p.text).map((p: { text: string }) => p.text).join('');
    const toolCalls = parts
        .filter((p: { functionCall?: unknown }) => p.functionCall)
        .map((p: { functionCall: { name: string; args: Record<string, unknown> } }, i: number) => ({ id: `${p.functionCall.name}-${i}`, name: p.functionCall.name, args: p.functionCall.args || {} }));
    return { assistant: { role: 'model', parts }, text, toolCalls };
}
