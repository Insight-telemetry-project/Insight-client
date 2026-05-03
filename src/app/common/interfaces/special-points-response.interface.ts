export interface SpecialPointsResponse {
  anomalies: Record<string, number[]>;
  historicalSimilarity: Record<string, Array<{ anomalyTime: number }>>;
}
