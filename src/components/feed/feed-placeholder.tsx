import { SearchX, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

/** Shape of the paper screen while the first page loads. */
export function FeedSkeleton({ label }: { label: string }) {
  const bar = "rounded-full bg-fill motion-safe:animate-pulse";
  return (
    <div role="status" className="mx-auto flex h-full max-w-[1600px] flex-col gap-5 px-4 pt-[72px] pb-6 min-[900px]:grid min-[900px]:grid-cols-[55fr_45fr] min-[900px]:gap-12 min-[900px]:px-10 min-[900px]:pt-[88px] min-[900px]:pb-10">
      <div className="flex h-[38%] shrink-0 items-center justify-center rounded-3xl bg-stage min-[900px]:h-full">
        <p className="px-6 text-center text-callout text-white/70">{label}</p>
      </div>
      <div aria-hidden className="flex flex-col justify-center gap-4 min-[900px]:max-w-[560px]">
        <div className={`${bar} h-6 w-28`} />
        <div className={`${bar} h-9 w-[90%]`} />
        <div className={`${bar} h-9 w-[70%]`} />
        <div className={`${bar} mt-2 h-4 w-48`} />
        <div className="mt-4 flex flex-col gap-3">
          {[100, 96, 98, 92, 60].map((w, i) => (
            <div key={i} className={`${bar} h-4`} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Full-screen message for an empty or failed feed, with an optional action. */
export function FeedMessage({ kind, title, detail, action }: { kind: "empty" | "error"; title: string; detail: string; action?: ReactNode }) {
  const Icon = kind === "error" ? WifiOff : SearchX;
  return (
    <div role={kind === "error" ? "alert" : "status"} className="flex h-full flex-col items-center justify-center gap-3 px-8 pt-14 text-center">
      <Icon aria-hidden className="size-8 text-muted" strokeWidth={1.75} />
      <p className="text-body font-semibold">{title}</p>
      <p className="max-w-sm text-callout text-muted">{detail}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export const pillButton =
  "inline-flex h-10 items-center rounded-full bg-foreground px-5 text-callout font-medium text-background transition-transform duration-200 ease-spring active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
