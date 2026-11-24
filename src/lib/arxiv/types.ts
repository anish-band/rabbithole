/** A paper as the app uses it, normalized from the arXiv Atom feed. */
export type Paper = {
  /** arXiv ID without version, e.g. "2411.01234" or "hep-th/9901001". */
  id: string;
  /** Latest version tag, e.g. "v2". */
  version: string;
  title: string;
  abstract: string;
  authors: string[];
  /** ISO date of the first version. */
  published: string;
  /** ISO date of the latest version. */
  updated: string;
  primaryCategory: string;
  categories: string[];
  absUrl: string;
  pdfUrl: string;
  comment?: string;
};

export type SearchOptions = {
  /** arXiv search query, e.g. `all:"diffusion models" AND cat:cs.LG`. */
  query: string;
  start?: number;
  maxResults?: number;
  sortBy?: "relevance" | "lastUpdatedDate" | "submittedDate";
  sortOrder?: "ascending" | "descending";
};

export type SearchResult = {
  papers: Paper[];
  totalResults: number;
};
