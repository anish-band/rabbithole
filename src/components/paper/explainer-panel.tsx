"use client";

import { useMemo } from "react";
import { ExplainerPlayer } from "@/components/explainer/player";
import type { Paper } from "@/lib/arxiv/types";
import { titleCard } from "@/lib/explainer/title-card";
import type { ExplainerState } from "./use-explainer";

const NOTES: Record<string, string> = {
  loading: "Generating explainer…",
  budget: "Explainer budget used up",
  "rate-limited": "Explainers are busy — try again soon",
  unavailable: "Explainers are offline",
  failed: "Couldn’t make an explainer for this one",
};

/**
 * Left-hand stage for the animated explainer: dark in both themes, like a
 * video player. Plays the generated script or video; until one exists (or
 * when it can't be made) it plays a local animated title card instead.
 */
export function ExplainerPanel({ paper, state, active }: { paper: Paper; state: ExplainerState; active: boolean }) {
  const card = useMemo(() => titleCard(paper), [paper]);
  const explainer = state.status === "ready" ? state.explainer : card;
  const note = state.status === "loading" ? NOTES.loading : state.status === "fallback" ? NOTES[state.reason] : null;

  return (
    <figure
      aria-label="Explainer"
      aria-busy={state.status === "loading"}
      className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl bg-stage p-4 text-white shadow-card min-[900px]:p-6"
    >
      {explainer.type === "scenes" ? (
        // Remount when the real script replaces the title card so it starts from scene 1.
        <ExplainerPlayer key={state.status === "ready" ? "ready" : "card"} script={explainer} active={active} />
      ) : (
        <video
          src={explainer.url}
          poster={explainer.poster}
          controls
          playsInline
          preload="metadata"
          className="size-full rounded-2xl object-contain"
        >
          {explainer.captionsUrl ? <track kind="captions" src={explainer.captionsUrl} default /> : null}
        </video>
      )}
      {note ? (
        <p
          role="status"
          data-explainer-note={state.status === "fallback" ? state.reason : "loading"}
          className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-footnote text-white/70 min-[900px]:top-4 min-[900px]:left-4"
        >
          {state.status === "loading" ? <span aria-hidden className="ex-pulse size-1.5 rounded-full bg-white/70" /> : null}
          {note}
        </p>
      ) : null}
    </figure>
  );
}
