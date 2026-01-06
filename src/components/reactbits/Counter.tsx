import { motion, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';

interface NumberProps {
    mv: any;
    number: number;
    height: number;
}

function Number({ mv, number, height }: NumberProps) {
    let y = useTransform(mv, (latest: any) => {
        let placeValue = (latest as number) % 10;
        let offset = (10 + number - placeValue) % 10;
        let memo = offset * height;
        if (offset > 5) {
            memo -= 10 * height;
        }
        return memo;
    });

    return (
        <motion.span className="counter-number" style={{ y }}>
            {number}
        </motion.span>
    );
}

interface DigitProps {
    value: number | string;
    height: number;
    animatedValue: any;
    digitStyle?: React.CSSProperties;
}

function Digit({ value, height, animatedValue, digitStyle }: DigitProps) {
    if (value === '.') {
        return (
            <span
                className="counter-digit"
                style={{ height, ...digitStyle, width: 'fit-content' }}
            >
                .
            </span>
        );
    }

    return (
        <span className="counter-digit" style={{ height, ...digitStyle }}>
            {Array.from({ length: 10 }, (_, i) => (
                <Number key={i} mv={animatedValue} number={i} height={height} />
            ))}
        </span>
    );
}

interface CounterProps {
    value: number;
    fontSize?: number;
    padding?: number;
    places?: (number | string)[];
    gap?: number;
    borderRadius?: number;
    horizontalPadding?: number;
    textColor?: string;
    fontWeight?: string | number;
    containerStyle?: React.CSSProperties;
    counterStyle?: React.CSSProperties;
    digitStyle?: React.CSSProperties;
    gradientHeight?: number;
    gradientFrom?: string;
    gradientTo?: string;
}

export default function Counter({
    value,
    fontSize = 100,
    padding = 0,
    places,
    gap = 8,
    borderRadius = 4,
    horizontalPadding = 8,
    textColor = 'inherit',
    fontWeight = 'inherit',
    containerStyle,
    counterStyle,
    digitStyle,
    gradientHeight = 16,
    gradientFrom = 'black',
    gradientTo = 'transparent',
}: CounterProps) {
    const height = fontSize + padding;

    // Auto-calculate places if not provided
    const computedPlaces = places || [...value.toString()].map((ch, i, a) => {
        if (ch === '.') return '.';
        // Calculate powers of 10 for each position
        return 10 ** (a.indexOf('.') === -1 ? a.length - i - 1 : i < a.indexOf('.') ? a.indexOf('.') - i - 1 : -(i - a.indexOf('.')));
    });

    const animatedValue = useSpring(value, {
        stiffness: 100,
        damping: 15,
    });

    useEffect(() => {
        animatedValue.set(value);
    }, [value, animatedValue]);

    return (
        <div className="counter-container" style={{ ...containerStyle }}>
            <div
                className="counter-counter"
                style={{
                    fontSize,
                    lineHeight: 1,
                    gap,
                    color: textColor,
                    fontWeight,
                    ...counterStyle,
                }}
            >
                {computedPlaces.map((place, i) => (
                    <Digit
                        key={i}
                        value={place}
                        height={height}
                        animatedValue={useTransform(animatedValue, (v) =>
                            place === '.' ? 0 : Math.abs(v as number) / (place as number)
                        )}
                        digitStyle={digitStyle}
                    />
                ))}
            </div>

            <div className="gradient-container">
                <div
                    className="top-gradient"
                    style={{
                        height: gradientHeight,
                        background: `linear-gradient(to bottom, ${gradientFrom}, ${gradientTo})`,
                    }}
                />
                <div
                    className="bottom-gradient"
                    style={{
                        height: gradientHeight,
                        background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})`,
                    }}
                />
            </div>
            <style dangerouslySetInnerHTML={{
                __html: `
                .counter-container {
                    position: relative;
                    display: inline-block;
                }
                .counter-counter {
                    display: flex;
                    overflow: hidden;
                }
                .counter-digit {
                    position: relative;
                    width: 1ch;
                    font-variant-numeric: tabular-nums;
                }
                .counter-number {
                    position: absolute;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    left: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .gradient-container {
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    z-index: 10;
                }
                .top-gradient {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                }
                .bottom-gradient {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                }
            `}} />
        </div>
    );
}
