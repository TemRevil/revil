import type { ImgHTMLAttributes } from 'react';
import { useObjectURL } from '../hooks/useObjectURL';

type FileImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
    /** Either a remote URL string or a File/Blob object */
    src: string | File | Blob | null | undefined;
    /** Optional fallback to render when src resolves to null */
    fallbackSrc?: string;
};

/**
 * Drop-in <img> replacement that safely handles File/Blob sources.
 * - Creates blob URLs via useObjectURL (revoked automatically on unmount)
 * - Forwards all standard <img> attrs (className, style, onClick, etc.)
 * - Use instead of inline URL.createObjectURL(...) calls to prevent memory leaks.
 */
const FileImage = ({ src, fallbackSrc, alt = '', ...rest }: FileImageProps) => {
    const url = useObjectURL(src);
    if (!url && !fallbackSrc) return null;
    return <img src={url ?? fallbackSrc} alt={alt} {...rest} />;
};

export default FileImage;
