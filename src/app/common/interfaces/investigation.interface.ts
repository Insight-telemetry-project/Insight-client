export interface Investigation {
  id?: string;
  name: string;
  description: string;
  masterIndex: number;
  param: string;
  time: number;
  value: number;
  createdAt?: string;
}
