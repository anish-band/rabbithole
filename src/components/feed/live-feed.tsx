"use client";

import { useState } from "react";
import { MoodBar } from "@/components/chrome/mood-bar";
import { TopBar } from "@/components/chrome/top-bar";
import { createApiSource, type FeedMeta } from "@/lib/feed/api-source";
import { tasteSignals } from "@/lib/taste/store";
import { readTaste } from "@/lib/taste/use-taste";
import { Feed } from "./feed";

/**
 * The real feed: /api/feed pages ranked for the current mood and the on-device
 * taste profile. Changing the mood starts a fresh feed.
 */
export function LiveFeed() {
  const [mood, setMood] = useState("");
  const [meta, setMeta] = useState<FeedMeta>();
  const [source, setSource] = useState(() => createApiSource({ signals: () => tasteSignals(readTaste()), onMeta: setMeta }));

  const changeMood = (next: string) => {
    setMood(next);
    setMeta(undefined);
    setSource(createApiSource({ mood: next || undefined, signals: () => tasteSignals(readTaste()), onMeta: setMeta }));
  };

  return (
    <>
      <Feed
        key={mood}
        source={source}
        initialItems={[]}
        Header={TopBar}
        headerContent={<MoodBar key={mood} mood={mood} onChange={changeMood} />}
        loadingLabel={mood ? `Finding papers for “${mood}”…` : "Finding fresh papers…"}
        emptyMessage={{ title: "Nothing matched that mood", detail: "Try different words, or clear the mood for a mixed feed." }}
      />
      <p aria-live="polite" className="sr-only">
        {meta ? `Showing papers for ${meta.label}` : ""}
      </p>
    </>
  );
}
