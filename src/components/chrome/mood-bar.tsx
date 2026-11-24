"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * "I'm in the mood for…" field. Enter applies the mood (the feed restarts),
 * the clear button returns to the default feed. `/` focuses it from anywhere;
 * Escape hands the keyboard back to the feed.
 */
export function MoodBar({ mood, onChange }: { mood: string; onChange: (mood: string) => void }) {
  const [value, setValue] = useState(mood);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable], dialog")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const apply = (next: string) => {
    const trimmed = next.trim();
    setValue(trimmed);
    inputRef.current?.blur();
    if (trimmed !== mood) onChange(trimmed);
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        apply(value);
      }}
      className="relative w-full max-w-[440px]"
    >
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue(mood);
            e.currentTarget.blur();
          }
        }}
        maxLength={200}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        aria-label="Mood"
        aria-keyshortcuts="/"
        placeholder="I’m in the mood for…"
        className="h-9 w-full rounded-full bg-fill ps-9 pe-9 text-callout text-foreground transition-[background-color,box-shadow] duration-200 ease-spring outline-none placeholder:text-muted focus:bg-background focus:shadow-[0_0_0_1px_var(--hairline),0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => apply("")}
          aria-label="Clear mood"
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-fill hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </form>
  );
}
