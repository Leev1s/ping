import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import "./theme-picker.css";

export const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "light-neutral", label: "Light neutral" },
  { value: "dark-neutral", label: "Dark neutral" },
  { value: "halloween", label: "Halloween" },
  { value: "forest", label: "Forest" },
  { value: "dracula", label: "Dracula" },
  { value: "night", label: "Night" },
  { value: "dim", label: "Dim" },
  { value: "nord", label: "Nord" },
  { value: "sunset", label: "Sunset" },
  { value: "abyss", label: "Abyss" },
  { value: "cupcake", label: "Cupcake" },
  { value: "dark-daisyui5", label: "Dark daisyUI 5" },
  { value: "gruvbox", label: "Gruvbox" },
] as const;

export type Theme = (typeof THEME_OPTIONS)[number]["value"];

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" &&
    THEME_OPTIONS.some((theme) => theme.value === value)
  );
}

export function ThemePicker({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() =>
    THEME_OPTIONS.findIndex((theme) => theme.value === value),
  );
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selected = THEME_OPTIONS.find((theme) => theme.value === value)!;

  useEffect(() => {
    setActive(THEME_OPTIONS.findIndex((theme) => theme.value === value));
  }, [value]);

  useEffect(() => {
    if (open) {
      list.current
        ?.querySelector<HTMLButtonElement>(`[data-index="${active}"]`)
        ?.focus();
    }
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const choose = (theme: Theme) => {
    onChange(theme);
    setOpen(false);
    trigger.current?.focus();
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next = active;
    if (event.key === "ArrowDown") next = (active + 1) % THEME_OPTIONS.length;
    else if (event.key === "ArrowUp")
      next = (active - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = THEME_OPTIONS.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
      return;
    } else if (event.key === "Tab") {
      setOpen(false);
      return;
    } else return;

    event.preventDefault();
    setActive(next);
  };

  return (
    <div className="theme-picker" ref={root}>
      <button
        className="theme-select theme-picker-trigger"
        ref={trigger}
        type="button"
        aria-label={`Color theme: ${selected.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) setOpen(false);
          else {
            setActive(
              THEME_OPTIONS.findIndex((theme) => theme.value === value),
            );
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setActive(
              THEME_OPTIONS.findIndex((theme) => theme.value === value),
            );
            setOpen(true);
          }
        }}
      >
        <span className="theme-swatch" aria-hidden="true" />
        <span className="theme-picker-label">{selected.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="theme-picker-list"
          role="listbox"
          aria-label="Color theme"
          ref={list}
          onKeyDown={onListKeyDown}
        >
          {THEME_OPTIONS.map((theme, index) => (
            <button
              className="theme-picker-option"
              data-theme={theme.value}
              data-index={index}
              key={theme.value}
              type="button"
              role="option"
              aria-selected={value === theme.value}
              tabIndex={active === index ? 0 : -1}
              onFocus={() => setActive(index)}
              onClick={() => choose(theme.value)}
            >
              <span className="theme-option-swatch" aria-hidden="true" />
              <span>{theme.label}</span>
              {value === theme.value && (
                <Check
                  className="theme-option-check"
                  size={15}
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
