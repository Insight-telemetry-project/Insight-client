export interface SelectedPoint {
  type: 'anomaly' | 'historical';
  x: number;
  y: number;
  param: string;
  historicalId?: string;
  clientX: number;
  clientY: number;
  matchesCount?: number;
}
