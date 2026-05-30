import { useEffect, useMemo } from 'react';

/**
 * Returns a stable URL for an image source.
 * - If `src` is a string, returns it unchanged.
 * - If `src` is a File/Blob, creates a blob URL with URL.createObjectURL
 *   and revokes it automatically when the File changes or the component unmounts.
 *
 * This avoids the classic memory leak of calling URL.createObjectURL inline
 * during render (new URL every render, never freed).
 */
export function useObjectURL(src: string | File | Blob | null | undefined): string | null {
    const url = useMemo(() => {
        if (!src) return null;
        if (typeof src === 'string') return src;
        return URL.createObjectURL(src);
    }, [src]);

    useEffect(() => {
        return () => {
            // Only revoke blob URLs we created (string sources are untouched)
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        };
    }, [url]);

    return url;
}
