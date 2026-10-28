/** Small Canary pieces: the booking-path badge, the category badge and the category colour picker. */
import { MeetingCategory, CATEGORY_COLORS } from '../../../utils/categories';

/** Which of the two booking paths a guest used. Sky for /book, pink for the modal (as in Trails). */
export const ViaBadge = ({ via }: { via: 'book' | 'contact' }) => (
    <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-md font-semibold"
        style={via === 'book' ? { color: '#0ea5e9', background: 'rgba(14,165,233,0.12)' } : { color: '#ec4899', background: 'rgba(236,72,153,0.12)' }}>
        {via === 'book' ? 'Book page' : 'Contact'}
    </div>
);

/** The colour picker shared by the add and rename rows of the categories panel. */
export const ColorSwatches = ({ value, onPick, isDark }: { value: string; onPick: (c: string) => void; isDark: boolean }) => (
    <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Category colour">
        {CATEGORY_COLORS.map(c => {
            const on = value === c;
            return (
                <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`Colour ${c}`}
                    onClick={() => onPick(c)}
                    // The ring sits outside the dot so picking one doesn't resize it.
                    className="w-7 h-7 grid place-items-center rounded-full cursor-pointer transition-shadow"
                    style={{ boxShadow: on ? `0 0 0 2px ${isDark ? '#0b0b0f' : '#fff'}, 0 0 0 4px ${c}` : 'none' }}
                >
                    <span className="w-5 h-5 rounded-full" style={{ background: c }} />
                </button>
            );
        })}
    </div>
);

/** Small coloured pill naming a booking's category - list rows and details view. */
export const CategoryBadge = ({ cat, size = 'sm' }: { cat: MeetingCategory; size?: 'sm' | 'md' }) => (
    <span
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold ${size === 'md' ? 'px-2.5 py-1 text-xs' : 'p-1 px-1.5 text-[11px]'}`}
        style={{ background: `${cat.color}1f`, color: cat.color }}
    >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cat.color }} />
        {cat.name}
    </span>
);
