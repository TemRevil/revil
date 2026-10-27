import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class MemStorage {
    private m = new Map<string, string>();
    getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
    setItem(k: string, v: string) { this.m.set(k, String(v)); }
    removeItem(k: string) { this.m.delete(k); }
}

describe('override key storage', () => {
    let local: MemStorage, session: MemStorage;
    beforeEach(() => {
        vi.resetModules();
        local = new MemStorage();
        session = new MemStorage();
        vi.stubGlobal('window', {});
        vi.stubGlobal('localStorage', local);
        vi.stubGlobal('sessionStorage', session);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('keeps a pasted key for the tab only, never in localStorage', async () => {
        const llm = await import('./llm');
        llm.setKeyOverride('sk-test-123');
        expect(local.getItem('llm_key_override')).toBeNull();
        expect(llm.getApiKey()).toBe('sk-test-123');
        llm.setKeyOverride('');
        expect(llm.getApiKey()).toBe('');
    });

    it('removes a key an older build left in localStorage', async () => {
        local.setItem('llm_key_override', 'sk-old');
        const llm = await import('./llm');
        expect(local.getItem('llm_key_override')).toBeNull();
        expect(llm.getApiKey()).toBe('');
    });
});

describe('model id', () => {
    it('accepts real model ids', async () => {
        const { isValidModelId } = await import('./llm');
        for (const m of ['gemini-2.5-flash', 'claude-sonnet-4-5', 'gpt-4.1_mini']) expect(isValidModelId(m)).toBe(true);
    });

    it('refuses an id that would change the Gemini URL, before any request', async () => {
        const { chat } = await import('./llm');
        await expect(chat('gemini', '../../v1/files?x=', [])).rejects.toThrow('Invalid model id.');
        await expect(chat('gemini', 'gemini-pro:streamGenerateContent#', [])).rejects.toThrow('Invalid model id.');
    });
});
