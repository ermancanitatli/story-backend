export type SegmentName =
  | 'all'
  | 'non_premium'
  | 'premium'
  | 'active_7d'
  | 'inactive_30d'
  | 'custom_user_ids';

export interface SegmentOptions {
  customUserIds?: string[];
}

export interface SegmentResolveResult {
  count: number;
  externalIds: string[]; // User _id strings
  sampleIds: string[]; // ilk 10
}
