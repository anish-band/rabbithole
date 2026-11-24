"use client";

import { useState } from "react";
import { createMockSource, initialMockItems } from "@/lib/feed/mock-source";
import { TopBar } from "@/components/chrome/top-bar";
import { Feed } from "./feed";

const INITIAL_COUNT = 6;

/** Feed wired to the fixture papers. Swapped for the real feed source in #7. */
export function MockFeed() {
  const [initialItems] = useState(() => initialMockItems(INITIAL_COUNT));
  const [source] = useState(() => createMockSource({ start: INITIAL_COUNT }));
  return <Feed source={source} initialItems={initialItems} Header={TopBar} />;
}
