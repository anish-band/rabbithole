import { XMLParser } from "fast-xml-parser";
import type { Paper, SearchResult } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true, // arxiv:primary_category -> primary_category
  parseTagValue: false, // keep titles like "2.0" as text; numbers are converted explicitly
  isArray: (name) => ["entry", "author", "link", "category"].includes(name),
});

type AtomLink = { "@_href": string; "@_rel"?: string; "@_title"?: string; "@_type"?: string };
type AtomEntry = {
  id: string;
  title: string;
  summary: string;
  published: string;
  updated: string;
  author?: { name: string }[];
  link?: AtomLink[];
  category?: { "@_term": string }[];
  primary_category?: { "@_term": string };
  comment?: unknown;
};

/** Collapse the line breaks and runs of spaces arXiv puts in titles and abstracts. */
export function cleanText(text: unknown): string {
  return String(textOf(text) ?? "").replace(/\s+/g, " ").trim();
}

/** Elements with attributes parse to { "#text": ..., "@_attr": ... }. */
function textOf(node: unknown): unknown {
  return node && typeof node === "object" && "#text" in node ? (node as { "#text": unknown })["#text"] : node;
}

/** "http://arxiv.org/abs/2411.01234v2" -> { id: "2411.01234", version: "v2" } */
export function parseArxivId(url: string): { id: string; version: string } {
  const raw = url.replace(/^https?:\/\/arxiv\.org\/abs\//, "");
  const match = raw.match(/^(.*?)(v\d+)?$/);
  return { id: match?.[1] ?? raw, version: match?.[2] ?? "v1" };
}

function toPaper(entry: AtomEntry): Paper {
  const { id, version } = parseArxivId(String(entry.id));
  const links = entry.link ?? [];
  const pdf = links.find((l) => l["@_title"] === "pdf")?.["@_href"];
  const categories = (entry.category ?? []).map((c) => c["@_term"]);
  const comment = textOf(entry.comment);

  return {
    id,
    version,
    title: cleanText(entry.title),
    abstract: cleanText(entry.summary),
    authors: (entry.author ?? []).map((a) => cleanText(a.name)),
    published: entry.published,
    updated: entry.updated,
    primaryCategory: entry.primary_category?.["@_term"] ?? categories[0] ?? "",
    categories,
    absUrl: `https://arxiv.org/abs/${id}`,
    pdfUrl: (pdf ?? `https://arxiv.org/pdf/${id}`).replace(/^http:/, "https:"),
    ...(comment ? { comment: cleanText(comment) } : {}),
  };
}

/** Parse an arXiv API Atom response. Throws on an API error entry. */
export function parseAtomFeed(xml: string): SearchResult {
  const doc = parser.parse(xml);
  const feed = doc.feed;
  if (!feed) throw new Error("arXiv response is not an Atom feed");

  const entries: AtomEntry[] = feed.entry ?? [];
  // arXiv reports query errors as a single entry whose id points at /api/errors.
  const error = entries.find((e) => String(e.id).includes("/api/errors"));
  if (error) throw new Error(`arXiv API error: ${cleanText(error.summary)}`);

  return {
    papers: entries.map(toPaper),
    totalResults: Number(textOf(feed.totalResults) ?? entries.length),
  };
}
