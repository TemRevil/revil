import { ASCENT, BASELINE, DESCENT, STROKE, UNITS, penLine } from '../lib/pen/pen';

/**
 * A line of handwriting in the pen's strokes (lib/pen), sized by the font-size around it
 * and inked in currentColor. It sits on the text baseline like a word would. Rendered
 * whole, so the page reads right without a script; lib/handwrite writes it in by pen.
 * Decorative: put the words in the page's text too where they matter.
 */
export default function Handwriting({ text }: { text: string }) {
    const line = penLine(text);
    const top = BASELINE - ASCENT * UNITS;
    return (
        <svg
            className="pen"
            viewBox={`0 ${top} ${line.width} ${UNITS}`}
            width={`${line.width / UNITS}em`}
            height="1em"
            aria-hidden="true"
            focusable="false"
            style={{ display: 'inline-block', overflow: 'visible', verticalAlign: `${-DESCENT}em` }}
        >
            <g fill="none" stroke="currentColor" strokeWidth={STROKE * UNITS} strokeLinecap="round" strokeLinejoin="round">
                {line.letters.map((letter, i) => letter.kind === 'ink'
                    ? letter.strokes.map((s, j) => (
                        <path key={`${i}.${j}`} d={s.d} transform={`translate(${s.x} ${s.y})`} pathLength={1} data-pen={s.length.toFixed(3)} />
                    ))
                    : letter.kind === 'text'
                        ? <text key={i} x={letter.x} y={BASELINE} fontSize={UNITS} fontFamily="cursive" fill="currentColor" stroke="none" data-pen-text>{letter.char}</text>
                        : <g key={i} data-pen-space />)}
            </g>
        </svg>
    );
}
