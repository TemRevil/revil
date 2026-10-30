import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { DOCK_SPRING } from '../lib/modalMotion';

/**
 * A modal's header icon. With `fly` on it is the same shared element as its navbar button's
 * icon (`id`), so on desktop it flies from the navbar into the header and back on close.
 * Off (touch screens, or a modal rendered only to warm up) it is just the icon, so a hidden
 * warm render can't take the navbar's icon.
 */
const DockIcon = ({ id, fly, className, children }: { id: string; fly: boolean; className?: string; children: ReactNode }) =>
    fly ? (
        <motion.div layoutId={id} transition={DOCK_SPRING} className={`flex items-center justify-center ${className ?? ''}`}>
            {children}
        </motion.div>
    ) : <>{children}</>;

export default DockIcon;
