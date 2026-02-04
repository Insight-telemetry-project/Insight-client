export interface HistoricalSimilarityPoint {
  recordId: string;
  comparedFlightIndex: number;
  startIndex: number;
  endIndex: number;
  label: string;
  finalScore: number;
}
