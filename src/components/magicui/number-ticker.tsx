// Adapted from magicuidesign/magicui NumberTicker (MIT). See /magicui-LICENSE.
// https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/number-ticker.tsx
import { useEffect, useRef } from "react";
import {
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
export function NumberTicker({
  value,
  decimalPlaces = 0,
}: {
  value: number;
  decimalPlaces?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  useEffect(() => {
    if (inView) motionValue.set(value);
  }, [value, inView, motionValue]);
  useEffect(
    () =>
      spring.on("change", (latest) => {
        if (ref.current && !reduced)
          ref.current.textContent = latest.toFixed(decimalPlaces);
      }),
    [spring, decimalPlaces, reduced],
  );
  return (
    <span ref={ref} aria-label={value.toFixed(decimalPlaces)}>
      {value.toFixed(decimalPlaces)}
    </span>
  );
}
