import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders assistant replies as GitHub-flavored Markdown - headings, lists,
 * tables, inline code and fenced code blocks. Styling lives in the `.md` block
 * in globals.css so it's theme-aware. Links open in a new tab.
 */
const Markdown = ({ children }: { children: string }) => (
    <div className="md">
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
            }}
        >
            {children}
        </ReactMarkdown>
    </div>
);

export default Markdown;
