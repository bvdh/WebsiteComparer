import type { PaneSide } from "../types/sync";

export type ChangeMarker = { ratio: number; side: PaneSide };

export const collectChangeMarkersFromElements = (
  doc: Document, elements: HTMLElement[], side: PaneSide
): ChangeMarker[] => {
  const scrollElement = doc.scrollingElement || doc.documentElement;
  const viewportHeight =
    doc.defaultView?.innerHeight || doc.documentElement.clientHeight || scrollElement.clientHeight;
  const maxScroll = Math.max(scrollElement.scrollHeight - viewportHeight, 0);
  if (maxScroll <= 0 || elements.length === 0) return [];
  const scrollTop = doc.defaultView?.scrollY || (doc.scrollingElement?.scrollTop ?? 0);
  const ratios = new Set<number>();
  elements.forEach((element) => {
    const ratio = Math.min(Math.max((element.getBoundingClientRect().top + scrollTop) / maxScroll, 0), 1);
    ratios.add(Math.round(ratio * 1000) / 1000);
  });
  return Array.from(ratios).sort((a, b) => a - b).map((ratio) => ({ ratio, side }));
};
