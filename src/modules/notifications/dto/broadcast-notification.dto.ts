export type LocalizedText = Partial<
  Record<
    'en' | 'tr' | 'ar' | 'de' | 'es' | 'fr' | 'it' | 'ja' | 'ko' | 'pt' | 'ru' | 'zh',
    string
  >
>;

export class BroadcastNotificationDto {
  headings!: LocalizedText;
  contents!: LocalizedText;
  includeExternalIds?: string[];
  filters?: any[];
  bigPicture?: string;
  url?: string;
  data?: Record<string, any>;
  sendAfter?: string;
}
