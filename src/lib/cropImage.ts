/** Image cropping for the dashboard's upload-and-crop dialogs (profile photo, contributors). */

/** The pixel rectangle react-easy-crop reports for the chosen crop. */
export interface CropArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Load an image element. A remote image is requested with CORS (so a canvas that draws it
 * can still be exported) and a cache-busting query, because the browser may hold an
 * earlier non-CORS response to the same URL. Pass useCrossOrigin false to just measure it.
 */
export const createImage = (url: string, useCrossOrigin: boolean = true): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        const remote = useCrossOrigin && url.startsWith('http');
        if (remote) image.setAttribute('crossOrigin', 'anonymous');
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.src = remote ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : url;
    });

/** Cut `area` out of the image at `imageSrc` and return it as a WebP file. */
export async function getCroppedImg(imageSrc: string, area: CropArea | null): Promise<File> {
    if (!area || area.width <= 0 || area.height <= 0) {
        throw new Error(`Invalid crop dimensions: ${JSON.stringify(area)}`);
    }
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2d context');

    canvas.width = area.width;
    canvas.height = area.height;
    ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Canvas is empty'));
                return;
            }
            resolve(new File([blob], 'cropped.webp', { type: 'image/webp' }));
        }, 'image/webp');
    });
}

/** A picked file as a data: URL, for the cropper to show. */
export const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result)), false);
        reader.addEventListener('error', () => reject(reader.error), false);
        reader.readAsDataURL(file);
    });
