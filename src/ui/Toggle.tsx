import { motion } from 'motion/react';

interface Props {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    /** Optional colour override. Defaults to the app's primary (--accent). */
    color?: string;
    'aria-label'?: string;
}

/**
 * Reusable animated switch. Replaces the ad-hoc `<input type="checkbox">`es that each
 * hardcoded their own accent (emerald / green / amber / blue) - this follows the app's
 * primary colour instead, and the knob springs across rather than snapping.
 * Renders a real role="switch" button, so it stays keyboard- and screen-reader-correct.
 */
const Toggle = ({ checked, onChange, disabled = false, color = 'var(--accent)', 'aria-label': ariaLabel }: Props) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className="relative shrink-0 rounded-full outline-none"
        style={{
            width: 40,
            height: 24,
            padding: 3,
            border: 'none',
            background: checked ? color : 'color-mix(in srgb, var(--text-primary) 18%, transparent)',
            transition: 'background-color 0.2s ease',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
        }}
    >
        <motion.span
            animate={{ x: checked ? 16 : 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 34, mass: 0.6 }}
            className="block rounded-full"
            style={{ width: 18, height: 18, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
        />
    </button>
);

export default Toggle;
