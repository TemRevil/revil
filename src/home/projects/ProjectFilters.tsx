import { useLayoutEffect, useRef, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TagData as Tag } from '../../types';
import { useScrollRail } from '../../hooks/useScrollRail';
import TagIcon from './TagIcon';

interface Props {
    query: string;
    onQuery: (query: string) => void;
    tags: Tag[];
    picked: string[];
    onPick: Dispatch<SetStateAction<string[]>>;
    /** Tags no project carries together with the ones picked (deadTagsOf). */
    dead: Set<string>;
    shown: number;
    total: number;
}

/** The search box and the technology filter above the projects grid. */
export default function ProjectFilters({ query, onQuery, tags, picked, onPick, dead, shown, total }: Props) {
    const tagRail = useRef<HTMLDivElement>(null);
    const rail = useScrollRail(tagRail);

    const toggleTag = (tagName: string) => {
        onPick(prev =>
            prev.includes(tagName)
                ? prev.filter(t => t !== tagName)
                : [...prev, tagName]
        );
    };

    // On a phone the picked tags move to the front of the rail, so it goes back there once
    // they have moved.
    const { toStart } = rail;
    useLayoutEffect(() => { toStart(); }, [picked, toStart]);

    return (
        <>
            <div className="mb-6 max-w-[600px]">
                <div className="glass-surface flex items-center p-3 px-5 border border-[var(--section-border)] shadow-md transition-shadow duration-300">
                    <Search size={20} className="text-sec mr-3" />
                    <input
                        type="text"
                        placeholder="Search projects by title, tags, or contributor..."
                        aria-label="Search projects"
                        value={query}
                        onChange={(e) => onQuery(e.target.value)}
                        className="border-none bg-transparent text-primary text-base w-full outline-none font-inter"
                    />
                    {query && (
                        <button
                            onClick={() => onQuery('')}
                            aria-label="Clear search"
                            className="bg-none border-none text-sec cursor-pointer flex items-center"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Filter tags. Wider screens wrap them all in place. Phones get a two-row
                rail that bleeds to the screen edges and swipes sideways, picked tags first
                in the order they were picked, so the projects start one short block below
                the search. */}
            <div className="mb-8 md:flex md:flex-wrap md:items-center md:gap-2.5">
                {/* Phone-only classes are max-md: and the wide ones md:, never a base class
                    undone by md: - globals.css has unlayered display utilities (.flex) that
                    would beat the layered md:hidden. */}
                <div className="max-md:flex items-center justify-between mb-3 md:hidden">
                    <span className="text-xs font-bold text-sec">
                        {picked.length > 0
                            ? `${shown} of ${total} projects`
                            : `Filter by technology`}
                    </span>
                    <div className="flex items-center gap-1.5">
                        {picked.length > 0 && (
                            <button
                                onClick={() => onPick([])}
                                className="text-xs font-bold text-accent cursor-pointer min-h-10 -my-2 px-1.5"
                            >
                                Clear {picked.length}
                            </button>
                        )}
                        {/* While tags are hidden past either end, both arrows stay so the
                            row never shifts; the one at an end that is reached dims. Out of
                            the tab order: focusing a tag already scrolls it into view. */}
                        {(rail.before || rail.after) && (
                            <>
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    aria-label="Show earlier technologies"
                                    disabled={!rail.before}
                                    onClick={() => rail.page(-1)}
                                    className="rail-arrow"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    aria-label="Show more technologies"
                                    disabled={!rail.after}
                                    onClick={() => rail.page(1)}
                                    className="rail-arrow"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <span className="hidden md:inline text-xs font-black text-sec mr-2.5 uppercase tracking-widest opacity-60">
                    Filter View:
                </span>

                {/* Tags Container */}
                <div
                    ref={tagRail}
                    data-more-before={rail.before || undefined}
                    data-more-after={rail.after || undefined}
                    className="phone-rail gap-2 max-md:grid max-md:grid-rows-2 max-md:grid-flow-col max-md:auto-cols-max max-md:overflow-x-auto max-md:overscroll-x-contain max-md:py-1 hide-scrollbar md:flex md:flex-wrap md:items-center">
                    {tags.map(tag => {
                        // On a phone the picked tags lead the rail in the order they were picked.
                        const pick = picked.indexOf(tag.name);
                        const isActive = pick >= 0;
                        const isDead = dead.has(tag.name);

                        return (
                            <button
                                key={tag.id}
                                onClick={() => toggleTag(tag.name)}
                                disabled={isDead}
                                aria-pressed={isActive}
                                style={isActive ? { '--pick': pick - picked.length } as CSSProperties : undefined}
                                title={isDead ? 'No project has this with the tags picked' : undefined}
                                className={`
                                    flex items-center gap-2 border font-bold transition-all duration-300 shadow-sm whitespace-nowrap
                                    max-md:h-10 max-md:px-3 max-md:rounded-lg max-md:text-[13px]
                                    md:px-4 md:py-2 md:rounded-xl md:text-sm md:backdrop-blur-xl
                                    ${isActive ? 'max-md:order-(--pick)' : ''}
                                    ${isDead ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}
                                    ${isActive
                                        ? 'border-accent bg-[rgba(59,130,246,0.12)] text-accent md:scale-105 z-10 shadow-[0_8px_16px_-4px_rgba(59,130,246,0.25)]'
                                        : 'border-[var(--section-border)] bg-[var(--card-bg)] text-sec'}
                                `}
                            >
                                {tag.iconSvg && (
                                    <TagIcon
                                        icon={tag.iconSvg}
                                        name={tag.name}
                                        className={`max-md:w-[18px] max-md:h-[18px] md:w-8 md:h-8 fill-current ${isActive ? '' : 'grayscale opacity-60'}`}
                                    />
                                )}
                                {tag.name}
                            </button>
                        );
                    })}

                    {picked.length > 0 && (
                        <button
                            onClick={() => onPick([])}
                            className="hidden md:inline-block px-3 py-2 bg-transparent border-none text-accent text-xs font-black cursor-pointer transition-all duration-200 uppercase tracking-widest ml-1 hover:opacity-70"
                        >
                            [ Reset ]
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
