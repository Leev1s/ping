// Adapted from Magic UI MagicCard (MIT). See /public/magicui-LICENSE.
// https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/magic-card.tsx
import {
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  motion,
} from "motion/react";
import type {
  ComponentPropsWithoutRef,
  PointerEvent as ReactPointerEvent,
} from "react";

export type MagicCardProps = ComponentPropsWithoutRef<"article">;

export function MagicCard({
  children,
  className,
  onPointerMove,
  onPointerLeave,
  style,
  ...props
}: MagicCardProps) {
  const x = useMotionValue(-280);
  const y = useMotionValue(-280);
  const reducedMotion = useReducedMotion();
  const background = useMotionTemplate`radial-gradient(280px circle at ${x}px ${y}px, color-mix(in srgb, var(--accent) 12%, transparent), transparent 76%)`;

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!reducedMotion && event.pointerType === "mouse") {
      const bounds = event.currentTarget.getBoundingClientRect();
      x.set(event.clientX - bounds.left);
      y.set(event.clientY - bounds.top);
    }
    onPointerMove?.(event);
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLElement>) => {
    x.set(-280);
    y.set(-280);
    onPointerLeave?.(event);
  };

  return (
    <article
      {...props}
      className={["magic-card", className].filter(Boolean).join(" ")}
      style={{
        position: "relative",
        isolation: "isolate",
        overflow: "hidden",
        ...style,
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <motion.div
        className="magic-card-glow"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: -1,
          pointerEvents: "none",
          background,
          opacity: reducedMotion ? 0 : undefined,
        }}
      />
      {children}
    </article>
  );
}
