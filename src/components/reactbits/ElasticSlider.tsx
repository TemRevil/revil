import React, { useRef, useState } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';

const MAX_OVERFLOW = 50;

interface ElasticSliderProps {
  /** Controlled value. Omit to let the slider own its state (uncontrolled). */
  value?: number;
  /** Fires on every change. Required to drive a form. */
  onChange?: (value: number) => void;
  defaultValue?: number;
  startingValue?: number;
  maxValue?: number;
  className?: string;
  isStepped?: boolean;
  stepSize?: number;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Appended to the readout under the track, e.g. "%" or " mo". */
  suffix?: string;
  'aria-label'?: string;
}

/**
 * ElasticSlider (React Bits) - the track stretches and rubber-bands when you drag past
 * either end. Adapted from the upstream source in three ways:
 *  - it's now CONTROLLED (upstream only kept internal state and exposed no onChange, so it
 *    could never drive a form),
 *  - colours follow --accent instead of hardcoded grays,
 *  - the layout is de-stretched: upstream fixes w-48 and floats the readout with `absolute
 *    -translate-y-4` (which anchors to whatever ancestor happens to be positioned), so it's
 *    full-width here and the readout sits in normal flow.
 */
const ElasticSlider: React.FC<ElasticSliderProps> = ({
  value,
  onChange,
  defaultValue = 50,
  startingValue = 0,
  maxValue = 100,
  className = '',
  isStepped = false,
  stepSize = 1,
  leftIcon = <>-</>,
  rightIcon = <>+</>,
  suffix = '',
  'aria-label': ariaLabel,
}) => {
  return (
    <div className={`relative flex w-full flex-col items-center gap-1 ${className}`}>
      <Slider
        value={value}
        onChange={onChange}
        defaultValue={defaultValue}
        startingValue={startingValue}
        maxValue={maxValue}
        isStepped={isStepped}
        stepSize={stepSize}
        leftIcon={leftIcon}
        rightIcon={rightIcon}
        suffix={suffix}
        ariaLabel={ariaLabel}
      />
    </div>
  );
};

interface SliderProps {
  value?: number;
  onChange?: (value: number) => void;
  defaultValue: number;
  startingValue: number;
  maxValue: number;
  isStepped: boolean;
  stepSize: number;
  leftIcon: React.ReactNode;
  rightIcon: React.ReactNode;
  suffix: string;
  ariaLabel?: string;
}

const Slider: React.FC<SliderProps> = ({
  value: controlled,
  onChange,
  defaultValue,
  startingValue,
  maxValue,
  isStepped,
  stepSize,
  leftIcon,
  rightIcon,
  suffix,
  ariaLabel,
}) => {
  const [internal, setInternal] = useState<number>(defaultValue);
  const isControlled = controlled !== undefined;
  const value = isControlled ? (controlled as number) : internal;

  const sliderRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<'left' | 'middle' | 'right'>('middle');
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);

  const commit = (v: number) => {
    if (!isControlled) setInternal(v);
    onChange?.(v);
  };

  // NOTE: upstream re-syncs defaultValue into state via an effect, which cascades renders
  // (and React's own guidance is against it). It's also wrong semantically: for an
  // UNCONTROLLED slider `defaultValue` seeds the initial state and nothing more. Callers
  // that need to push a value in should use the controlled `value` prop.

  useMotionValueEvent(clientX, 'change', (latest: number) => {
    if (sliderRef.current) {
      const { left, right } = sliderRef.current.getBoundingClientRect();
      let newValue: number;
      if (latest < left) {
        setRegion('left');
        newValue = left - latest;
      } else if (latest > right) {
        setRegion('right');
        newValue = latest - right;
      } else {
        setRegion('middle');
        newValue = 0;
      }
      overflow.jump(decay(newValue, MAX_OVERFLOW));
    }
  });

  const valueFromClientX = (x: number) => {
    if (!sliderRef.current) return value;
    const { left, width } = sliderRef.current.getBoundingClientRect();
    let next = startingValue + ((x - left) / width) * (maxValue - startingValue);
    if (isStepped) next = Math.round(next / stepSize) * stepSize;
    return Math.min(Math.max(next, startingValue), maxValue);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0) {
      commit(valueFromClientX(e.clientX));
      clientX.jump(e.clientX);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    commit(valueFromClientX(e.clientX));
    clientX.jump(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = () => {
    animate(overflow, 0, { type: 'spring', bounce: 0.5 });
  };

  // Keyboard support: upstream has none, so the control was unreachable without a mouse.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const stepBy = isStepped ? stepSize : (maxValue - startingValue) / 100;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + stepBy;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - stepBy;
    else if (e.key === 'Home') next = startingValue;
    else if (e.key === 'End') next = maxValue;
    if (next !== null) {
      e.preventDefault();
      commit(Math.min(Math.max(next, startingValue), maxValue));
    }
  };

  const getRangePercentage = (): number => {
    const totalRange = maxValue - startingValue;
    if (totalRange === 0) return 0;
    return ((value - startingValue) / totalRange) * 100;
  };

  return (
    <>
      <motion.div
        onHoverStart={() => animate(scale, 1.2)}
        onHoverEnd={() => animate(scale, 1)}
        onTouchStart={() => animate(scale, 1.2)}
        onTouchEnd={() => animate(scale, 1)}
        style={{ scale, opacity: useTransform(scale, [1, 1.2], [0.7, 1]) }}
        className="flex w-full touch-none select-none items-center justify-center gap-3"
      >
        <motion.div
          animate={{ scale: region === 'left' ? [1, 1.4, 1] : 1, transition: { duration: 0.25 } }}
          style={{ x: useTransform(() => (region === 'left' ? -overflow.get() / scale.get() : 0)) }}
          className="flex shrink-0 items-center text-sec"
        >
          {leftIcon}
        </motion.div>

        <div
          ref={sliderRef}
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={startingValue}
          aria-valuemax={maxValue}
          aria-valuenow={Math.round(value)}
          aria-valuetext={`${Math.round(value)}${suffix}`}
          onKeyDown={handleKeyDown}
          className="relative flex w-full flex-grow cursor-grab touch-none select-none items-center py-3 outline-none"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        >
          <motion.div
            style={{
              scaleX: useTransform(() => {
                if (sliderRef.current) {
                  const { width } = sliderRef.current.getBoundingClientRect();
                  return 1 + overflow.get() / width;
                }
                return 1;
              }),
              scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
              transformOrigin: useTransform(() => {
                if (sliderRef.current) {
                  const { left, width } = sliderRef.current.getBoundingClientRect();
                  return clientX.get() < left + width / 2 ? 'right' : 'left';
                }
                return 'center';
              }),
              height: useTransform(scale, [1, 1.2], [6, 12]),
              marginTop: useTransform(scale, [1, 1.2], [0, -3]),
              marginBottom: useTransform(scale, [1, 1.2], [0, -3]),
            }}
            className="flex flex-grow"
          >
            <div
              className="relative h-full flex-grow overflow-hidden rounded-full"
              style={{ background: 'color-mix(in srgb, var(--text-primary) 14%, transparent)' }}
            >
              <div
                className="absolute h-full rounded-full"
                style={{ width: `${getRangePercentage()}%`, background: 'var(--accent)' }}
              />
            </div>
          </motion.div>
        </div>

        <motion.div
          animate={{ scale: region === 'right' ? [1, 1.4, 1] : 1, transition: { duration: 0.25 } }}
          style={{ x: useTransform(() => (region === 'right' ? overflow.get() / scale.get() : 0)) }}
          className="flex shrink-0 items-center text-sec"
        >
          {rightIcon}
        </motion.div>
      </motion.div>

      <p className="tnum text-[11px] font-bold tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {Math.round(value)}{suffix}
      </p>
    </>
  );
};

function decay(value: number, max: number): number {
  if (max === 0) return 0;
  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
  return sigmoid * max;
}

export default ElasticSlider;
