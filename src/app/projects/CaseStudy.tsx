import type { ReactNode } from 'react';

/**
 * A project's "Case Study" field (the long write-up, edited in the dashboard), folded
 * under "The story behind it" on the project page. Folded so the page stays short for
 * people; the text is still in the HTML for search engines and AI crawlers.
 *
 * The field is plain text with a tiny syntax: "### " starts a heading, "- " a bullet,
 * **bold**, and a blank line separates paragraphs. Nothing else is interpreted, so no
 * HTML from the field ever reaches the page.
 */

const inline = (text: string): ReactNode[] =>
    text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);

type Block = { kind: 'h'; text: string } | { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

export const parseCaseStudy = (source: string): Block[] => {
    const blocks: Block[] = [];
    for (const chunk of source.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
        let para: string[] = [];
        const flush = () => {
            if (para.length) blocks.push({ kind: 'p', text: para.join(' ') });
            para = [];
        };
        for (const raw of chunk.split('\n')) {
            const line = raw.trim();
            if (!line) continue;
            if (line.startsWith('### ')) {
                flush();
                blocks.push({ kind: 'h', text: line.slice(4).trim() });
            } else if (line.startsWith('- ')) {
                flush();
                const last = blocks[blocks.length - 1];
                if (last?.kind === 'ul') last.items.push(line.slice(2).trim());
                else blocks.push({ kind: 'ul', items: [line.slice(2).trim()] });
            } else {
                para.push(line);
            }
        }
        flush();
    }
    return blocks;
};

export default function CaseStudy({ text }: { text: string }) {
    const blocks = parseCaseStudy(text);
    if (!blocks.length) return null;
    return (
        <details className="pj-section pj-story">
            <summary><h2>The story behind it</h2></summary>
            <div className="pj-story-body">
                {blocks.map((b, i) =>
                    b.kind === 'h' ? <h3 key={i}>{b.text}</h3>
                    : b.kind === 'p' ? <p key={i}>{inline(b.text)}</p>
                    : <ul key={i}>{b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}</ul>)}
            </div>
        </details>
    );
}
