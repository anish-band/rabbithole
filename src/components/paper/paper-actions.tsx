"use client";

import { Bookmark, EyeOff, Heart, type LucideIcon } from "lucide-react";

export type PaperActionState = { liked: boolean; saved: boolean; hidden: boolean };
export type PaperAction = keyof PaperActionState;

type ActionDef = { key: PaperAction; label: string; activeLabel: string; Icon: LucideIcon };

const ACTIONS: ActionDef[] = [
  { key: "liked", label: "Like", activeLabel: "Liked", Icon: Heart },
  { key: "saved", label: "Save", activeLabel: "Saved", Icon: Bookmark },
  { key: "hidden", label: "Not interested", activeLabel: "Hidden", Icon: EyeOff },
];

/** Like / Save / Not interested. Outline icons by default, filled when active. */
export function PaperActions({
  state,
  onToggle,
}: {
  state: PaperActionState;
  onToggle: (action: PaperAction) => void;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Paper actions">
      {ACTIONS.map(({ key, label, activeLabel, Icon }) => {
        const active = state[key];
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(key)}
            className={`flex h-11 items-center gap-2 rounded-full ps-4 pe-[18px] text-callout font-medium transition-[background-color,color,transform] duration-200 ease-spring active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              active ? "bg-foreground text-background" : "bg-fill text-foreground hover:bg-fill/70"
            }`}
          >
            <Icon aria-hidden className="size-[18px]" strokeWidth={2} fill={active && key !== "hidden" ? "currentColor" : "none"} />
            {active ? activeLabel : label}
          </button>
        );
      })}
    </div>
  );
}
