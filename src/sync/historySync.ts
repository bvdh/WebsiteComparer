import { normalizeRelativePath } from "./urlMapping";

export type HistoryState = {
  entries: string[];
  index: number;
};

export const initialHistoryState = (): HistoryState => ({
  entries: ["/"],
  index: 0,
});

export const pushHistory = (state: HistoryState, nextPath: string): HistoryState => {
  const normalized = normalizeRelativePath(nextPath);
  const current = state.entries[state.index];

  if (current === normalized) {
    return state;
  }

  const nextEntries = state.entries.slice(0, state.index + 1);
  nextEntries.push(normalized);

  return {
    entries: nextEntries,
    index: nextEntries.length - 1,
  };
};

export const stepHistory = (state: HistoryState, direction: "back" | "forward"): HistoryState => {
  if (direction === "back") {
    return {
      ...state,
      index: Math.max(0, state.index - 1),
    };
  }

  return {
    ...state,
    index: Math.min(state.entries.length - 1, state.index + 1),
  };
};
