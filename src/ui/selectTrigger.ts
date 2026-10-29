/**
 * The look of Select's closed trigger, kept apart from Select (and its motion import) so a
 * page that loads Select late can draw the same box in its place meanwhile.
 */
export const selectTriggerClass = (isDark: boolean, { open = false, selected = true, disabled = false, className = '' } = {}) =>
    `w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-colors outline-none
        ${isDark ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-black/[0.03] border-black/10 hover:border-black/20'}
        ${open ? 'border-blue-400/60' : ''} ${selected ? 'text-primary' : 'text-sec'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`;
