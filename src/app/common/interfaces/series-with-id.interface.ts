export interface SeriesWithId {
  options: Record<string, unknown> & { id?: string };
  show(): void;
  hide(): void;
}
