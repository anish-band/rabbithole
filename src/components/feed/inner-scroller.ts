/**
 * Inner scrollers (marked `data-allow-wheel`, e.g. a paper's info column) get
 * first claim on wheel and keyboard scrolling; the feed only pages once they
 * reach an edge.
 */
export function innerScrollerCanTake(target: EventTarget | null, root: HTMLElement | null, direction: 1 | -1) {
  if (!(target instanceof Element)) return false;
  const inner = target.closest<HTMLElement>("[data-allow-wheel]");
  if (!inner || (root && !root.contains(inner))) return false;
  return direction > 0 ? inner.scrollTop + inner.clientHeight < inner.scrollHeight - 1 : inner.scrollTop > 0;
}
