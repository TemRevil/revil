import { motion, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';

interface DigitProps {
    value: number | string; // power of 10 or "."
    height: number;
    parentAnimatedValue: any;
    digitStyle?: React.CSSProperties;
    discrete?: boolean;
}

function Digit({ value, height, parentAnimatedValue, digitStyle, discrete }: DigitProps) {
    if (value === '.') {
        return (
            <div
                className="rb-counter-digit"
                style={{ height, ...digitStyle, width: 'fit-content' }}
            >
                .
            </div>
        );
    }

    const placeValuePower = value as number;

    // Standard roll logic: 0 through 9 in a vertical column
    const y = useTransform(parentAnimatedValue, (v: any) => {
        const totalValue = Math.max(0, v as number);
        const placeValue = totalValue / placeValuePower;

        // For discrete mode, we want to snap to the integer digit.
        // We use Math.floor to get the digit, but we must be careful with transitions.
        const currentDigit = discrete ? Math.floor(placeValue + 0.0001) % 10 : placeValue % 10;

        // Snap to exact pixel center to avoid bleeding edges
        return -currentDigit * height;
    });

    return (
        <div className="rb-counter-digit" style={{ height, width: 'auto', ...digitStyle }}>
            {/* Invisible anchor digit: This is the most reliable way to set width for bold fonts */}
            <div style={{
                visibility: 'hidden',
                pointerEvents: 'none',
                userSelect: 'none',
                height: height,
                display: 'flex',
                alignItems: 'center',
                padding: '0 0.05em'
            }}>8</div>

            <motion.div
                style={{
                    y,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: height * 10,
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 1
                }}
            >
                {Array.from({ length: 11 }, (_, i) => (
                    <div
                        key={i}
                        className="rb-counter-number"
                        style={{ height, minHeight: height, maxHeight: height }}
                    >
                        {i % 10}
                    </div>
                ))}
            </motion.div>
        </div>
    );
}

interface CounterProps {
    value: number;
    fontSize?: number;
    padding?: number;
    places?: (number | string)[];
    gap?: number;
    textColor?: string;
    fontWeight?: string | number;
    containerStyle?: React.CSSProperties;
    counterStyle?: React.CSSProperties;
    digitStyle?: React.CSSProperties;
    gradientHeight?: number;
    gradientFrom?: string;
    gradientTo?: string;
    discrete?: boolean;
}

export default function Counter({
    value,
    fontSize = 100,
    padding = 0,
    places,
    gap = 8,
    textColor = 'inherit',
    fontWeight = 'inherit',
    containerStyle,
    counterStyle,
    digitStyle,
    gradientHeight = 16,
    gradientFrom = 'black',
    gradientTo = 'transparent',
    discrete = false,
}: CounterProps) {
    const height = fontSize + padding;

    // Stable computed places logic with correct typing
    const computedPlaces: (number | string)[] = places || (function () {
        const stringVal = Math.floor(value).toString();
        return stringVal.split('').map((_, i, a) => {
            return Math.pow(10, a.length - i - 1);
        });
    })();

    const animatedValue = useSpring(Number(value), {
        stiffness: 100,
        damping: 20,
    });

    useEffect(() => {
        animatedValue.set(Number(value));
    }, [value, animatedValue]);

    return (
        <div className="rb-counter-container" style={{ ...containerStyle }}>
            <div
                className="rb-counter-counter"
                style={{
                    fontSize,
                    height,
                    gap,
                    color: textColor,
                    fontWeight,
                    ...counterStyle,
                }}
            >
                {computedPlaces.map((place, i) => (
                    <Digit
                        key={`${place}-${i}`}
                        value={place}
                        height={height}
                        discrete={discrete}
                        parentAnimatedValue={animatedValue}
                        digitStyle={digitStyle}
                    />
                ))}
            </div>

            {gradientHeight > 0 && (
                <div className="rb-gradient-container">
                    <div
                        className="rb-top-gradient"
                        style={{
                            height: gradientHeight,
                            background: `linear-gradient(to bottom, ${gradientFrom}, ${gradientTo})`,
                        }}
                    />
                    <div
                        className="rb-bottom-gradient"
                        style={{
                            height: gradientHeight,
                            background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})`,
                        }}
                    />
                </div>
            )}
        </div>
    );
}
