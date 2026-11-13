export type StructureUiState = {
  selectedId: string | null;
  hidden: Set<string>;
  isolatedId: string | null;
};

export type StructureUiAction =
  | { type: "select"; id: string | null }
  | { type: "toggleHidden"; id: string }
  | { type: "isolate"; id: string }
  | { type: "clearIsolate" }
  | { type: "showAll" }
  | { type: "reset" };

export function createStructureUiState(): StructureUiState {
  return { selectedId: null, hidden: new Set(), isolatedId: null };
}

export function structureUiReducer(
  state: StructureUiState,
  action: StructureUiAction,
): StructureUiState {
  switch (action.type) {
    case "select":
      return { ...state, selectedId: action.id };
    case "toggleHidden": {
      const hidden = new Set(state.hidden);
      if (hidden.has(action.id)) hidden.delete(action.id);
      else hidden.add(action.id);
      return { ...state, hidden };
    }
    case "isolate":
      return { ...state, isolatedId: action.id };
    case "clearIsolate":
      return { ...state, isolatedId: null };
    case "showAll":
      return { ...state, hidden: new Set(), isolatedId: null };
    case "reset":
      return createStructureUiState();
    default:
      return state;
  }
}

/** Effective visibility for a structure id given hide + isolate. */
export function isStructureVisible(
  state: StructureUiState,
  id: string,
): boolean {
  if (state.hidden.has(id)) return false;
  if (state.isolatedId !== null && state.isolatedId !== id) return false;
  return true;
}
