/** Display helpers for paper metadata. */

const CATEGORY_NAMES: Record<string, string> = {
  "cs.AI": "Artificial Intelligence",
  "cs.CL": "Computation and Language",
  "cs.CV": "Computer Vision",
  "cs.LG": "Machine Learning",
  "cs.IR": "Information Retrieval",
  "cs.RO": "Robotics",
  "cs.CR": "Cryptography and Security",
  "cs.DS": "Data Structures and Algorithms",
  "cs.CC": "Computational Complexity",
  "cs.HC": "Human-Computer Interaction",
  "cs.NE": "Neural and Evolutionary Computing",
  "cs.SE": "Software Engineering",
  "stat.ML": "Machine Learning (Statistics)",
  "math.PR": "Probability",
  "math.CO": "Combinatorics",
  "math.AG": "Algebraic Geometry",
  "math.NT": "Number Theory",
  "math.OC": "Optimization and Control",
  "math.MP": "Mathematical Physics",
  "math-ph": "Mathematical Physics",
  "quant-ph": "Quantum Physics",
  "hep-th": "High Energy Physics – Theory",
  "hep-ph": "High Energy Physics – Phenomenology",
  "gr-qc": "General Relativity and Quantum Cosmology",
  "astro-ph.CO": "Cosmology",
  "astro-ph.GA": "Astrophysics of Galaxies",
  "astro-ph.HE": "High Energy Astrophysics",
  "astro-ph.SR": "Solar and Stellar Astrophysics",
  "cond-mat.stat-mech": "Statistical Mechanics",
  "cond-mat.mtrl-sci": "Materials Science",
  "cond-mat.str-el": "Strongly Correlated Electrons",
  "q-bio.NC": "Neurons and Cognition",
  "q-bio.QM": "Quantitative Methods",
  "econ.TH": "Economic Theory",
  "econ.EM": "Econometrics",
  "physics.optics": "Optics",
  "physics.flu-dyn": "Fluid Dynamics",
  "eess.SP": "Signal Processing",
  "eess.IV": "Image and Video Processing",
};

/** Human name for an arXiv category, falling back to its code. */
export function categoryName(code: string): string {
  return CATEGORY_NAMES[code] ?? code;
}

/** "Nov 23, 2026" (UTC, so server and client agree). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Split authors into the ones shown up front and the rest. */
export function splitAuthors(authors: string[], shown = 3): { visible: string[]; hidden: string[] } {
  // Show everyone when hiding would only save one name.
  if (authors.length <= shown + 1) return { visible: authors, hidden: [] };
  return { visible: authors.slice(0, shown), hidden: authors.slice(shown) };
}
