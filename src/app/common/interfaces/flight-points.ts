import { HistoricalSimilarityPoint } from './historical-similarity-point.interface';

export interface FlightPoints {
  anomalies: Record<string, number[]>;
  historicalSimilarity: Record<string, HistoricalSimilarityPoint[]>;
}