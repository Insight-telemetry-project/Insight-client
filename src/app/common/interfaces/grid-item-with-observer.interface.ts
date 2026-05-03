import { GridChartItem } from './grid-chart-item.interface';

export interface GridItemWithObserver extends GridChartItem {
  resizeObserver?: ResizeObserver;
}
