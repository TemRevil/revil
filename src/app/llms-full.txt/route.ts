import { llmsFullText } from '../../utils/llmsText';

export const dynamic = 'force-static';

export function GET() {
    return new Response(llmsFullText(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
