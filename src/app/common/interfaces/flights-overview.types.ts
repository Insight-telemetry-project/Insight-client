export type SortType = 'anomalies' | 'historical';
export type FlightSortType = 'anomalies' | 'historical' | 'number';
export type ExportFormat = 'json' | string;
export type AnalysisStage = 'historical' | 'causality' | 'finished' | string;
export type DragEventType = DragEvent & { relatedTarget: EventTarget | null };
