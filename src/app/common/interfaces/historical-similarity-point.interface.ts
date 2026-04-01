export interface HistoricalSimilarityPoint {
  recordId: string;
  comparedFlightIndex: number;
  startEpoch: number;
  endEpoch: number;
  label: string;
  finalScore: number;
  anomalyTime: number;
}
