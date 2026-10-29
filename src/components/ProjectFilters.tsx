import { useId, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { sanitizeSvg } from '../lib/sanitize';
import type { TagData } from '../types';

interface Props {
    tags: TagData[];
    selected: string[];
    disabled: Set<string>;
    resultCount: number;
    onToggle: (name: string) => void;
    onClear: () => void;
}

export default function ProjectFilters({ tags, selected, disabled, resultCount, onToggle, onClear }: Props) {
    const [expanded, setExpanded] = useState(false);
    const listId = useId();
    return (
        <fieldset className="project-filters">
            <legend className="sr-only">Filter projects by technology</legend>
            <div className="project-filter-heading">
                <span>Technologies{selected.length > 0 && <span className="project-filter-count">{selected.length} selected</span>}</span>
                <span className="project-filter-results" role="status" aria-live="polite" aria-atomic="true">
                    {resultCount} {resultCount === 1 ? 'project' : 'projects'}
                </span>
            </div>
            <div id={listId} className="project-filter-options" data-expanded={expanded}>
                {tags.map((tag, index) => {
                    const active = selected.includes(tag.name);
                    const unavailable = disabled.has(tag.name);
                    const url = tag.iconSvg && (tag.iconSvg.startsWith('http') || tag.iconSvg.includes('/o/'));
                    return (
                        <button
                            type="button"
                            key={tag.id ?? tag.name}
                            className={`project-filter-chip${index >= 4 && !active ? ' project-filter-chip--extra' : ''}`}
                            aria-pressed={active}
                            disabled={unavailable}
                            title={unavailable ? 'No project matches this combination' : undefined}
                            onClick={() => onToggle(tag.name)}
                        >
                            {tag.iconSvg && <span className="project-filter-icon" aria-hidden="true">
                                {url
                                    ? <img src={tag.iconSvg} alt="" width={20} height={20} />
                                    : <span dangerouslySetInnerHTML={{ __html: sanitizeSvg(tag.iconSvg) }} />}
                            </span>}
                            <span className="project-filter-label">{tag.name}</span>
                            <span className="project-filter-check" aria-hidden="true">{active && <Check size={13} strokeWidth={3} />}</span>
                        </button>
                    );
                })}
            </div>
            <div className="project-filter-actions">
                {tags.length > 4 && <button type="button" className="project-filter-disclosure" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(value => !value)}>
                    {expanded ? 'Show fewer' : `Show all ${tags.length} technologies`}
                    <ChevronDown size={16} aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
                </button>}
                {selected.length > 0 && <button type="button" className="project-filter-clear" onClick={onClear}>
                    <X size={15} aria-hidden="true" /> Clear filters
                </button>}
            </div>
        </fieldset>
    );
}
