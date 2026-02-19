import { GridsterItem } from 'angular-gridster2';
import * as Highcharts from 'highcharts/highstock';

export interface GridChartItem extends GridsterItem {
  param: string;
  chart?: Highcharts.Chart;
  showAnomalies?: boolean;
  showHistory?: boolean;
}