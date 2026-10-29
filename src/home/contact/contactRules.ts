/**
 * What the contact form checks before anything leaves the browser. These are the same
 * rules submitContact enforces (functions/src/index.ts: textField, emailField,
 * attachmentsField), so a message the function would turn away is caught here, before
 * its attachments are uploaded to Storage for nothing.
 */

/** submitContact's limits, in characters (after trimming) and files. */
export const CONTACT_LIMITS = { name: 100, email: 254, message: 5000, number: 40, files: 5, fileName: 200 } as const;

/** Largest attachment, in bytes (storage.rules caps emails/** uploads at the same size). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Must stay an exact subset of the storage.rules contentType allowlist for emails/** -
// SVG is deliberately excluded there (executes JS as image/svg+xml), so accepting it
// here only to have the upload hard-rejected would silently fail the whole message.
export const ALLOWED_TYPES = [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface ContactForm {
    name: string;
    email: string;
    number: string;
    message: string;
    attachments: Array<Pick<File, 'name' | 'size' | 'type'>>;
}

/** The first problem with the form, worded for the visitor, or null when it can be sent. */
export function contactProblem(form: ContactForm): string | null {
    const name = form.name.trim(), email = form.email.trim(), message = form.message.trim(), number = form.number.trim();
    if (!name || !email || !message) return 'Please fill in all required fields (Name, Email, Message).';
    if (name.length > CONTACT_LIMITS.name) return `Name is too long (max ${CONTACT_LIMITS.name} characters).`;
    if (email.length > CONTACT_LIMITS.email || !EMAIL_RE.test(email)) return 'Please enter a valid email address.';
    if (number.length > CONTACT_LIMITS.number) return `Phone number is too long (max ${CONTACT_LIMITS.number} characters).`;
    if (message.length > CONTACT_LIMITS.message) return `Message is too long (max ${CONTACT_LIMITS.message} characters).`;
    if (form.attachments.length > CONTACT_LIMITS.files) return `At most ${CONTACT_LIMITS.files} attachments.`;
    for (const file of form.attachments) {
        if (file.size > MAX_FILE_SIZE) return `"${file.name}" exceeds 10MB limit.`;
        if (!ALLOWED_TYPES.includes(file.type)) return `"${file.name}" - file type not allowed. Use images, PDFs, or documents.`;
    }
    return null;
}

/** A folder for one message's attachments that nobody can guess (storage.rules lets anyone read by path). */
export const attachmentFolder = () => crypto.randomUUID();
