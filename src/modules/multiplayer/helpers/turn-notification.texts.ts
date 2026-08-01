import { DEFAULT_LOCALE, SUPPORTED_LOCALES, SupportedLocale } from '../../../shared/constants/locales';

/**
 * Sıra bildirimleri — alıcının dilinde.
 *
 * OneSignal `headings`/`contents` map'i çok dilli olabilir ama biz alıcıyı
 * tek tek hedeflediğimiz için metni burada çözüp `en` anahtarına koyuyoruz
 * (bkz. NotificationService.sendToUser — tek dilli gönderim).
 *
 * Şablon placeholder'ları: {partner}, {story}
 */
export interface TurnNotificationStrings {
  yourTurnTitle: string;
  yourTurnBody: string;
  reminderTitle: string;
  reminderBody: string;
}

const TEXTS: Record<SupportedLocale, TurnNotificationStrings> = {
  en: {
    yourTurnTitle: 'Your turn',
    yourTurnBody: '{partner} made a move. Continue “{story}”.',
    reminderTitle: '{partner} is waiting',
    reminderBody: 'It is still your turn in “{story}”. Pick up where you left off.',
  },
  tr: {
    yourTurnTitle: 'Sıra sende',
    yourTurnBody: '{partner} hamlesini yaptı. “{story}” seni bekliyor.',
    reminderTitle: '{partner} seni bekliyor',
    reminderBody: '“{story}” hikâyesinde sıra hâlâ sende. Kaldığın yerden devam et.',
  },
  ar: {
    yourTurnTitle: 'دورك الآن',
    yourTurnBody: 'لعب {partner} دوره. تابع «{story}».',
    reminderTitle: '{partner} في انتظارك',
    reminderBody: 'ما زال الدور لك في «{story}». تابع من حيث توقفت.',
  },
  de: {
    yourTurnTitle: 'Du bist dran',
    yourTurnBody: '{partner} hat gespielt. Mach weiter mit „{story}“.',
    reminderTitle: '{partner} wartet auf dich',
    reminderBody: 'In „{story}“ bist immer noch du am Zug. Mach dort weiter, wo du aufgehört hast.',
  },
  es: {
    yourTurnTitle: 'Es tu turno',
    yourTurnBody: '{partner} ya jugó. Continúa «{story}».',
    reminderTitle: '{partner} te está esperando',
    reminderBody: 'Sigue siendo tu turno en «{story}». Retoma donde lo dejaste.',
  },
  fr: {
    yourTurnTitle: 'À ton tour',
    yourTurnBody: '{partner} a joué. Continue « {story} ».',
    reminderTitle: '{partner} t’attend',
    reminderBody: 'C’est toujours à toi de jouer dans « {story} ». Reprends où tu t’es arrêté.',
  },
  it: {
    yourTurnTitle: 'Tocca a te',
    yourTurnBody: '{partner} ha giocato. Continua «{story}».',
    reminderTitle: '{partner} ti sta aspettando',
    reminderBody: 'È ancora il tuo turno in «{story}». Riprendi da dove eri rimasto.',
  },
  ja: {
    yourTurnTitle: 'あなたの番です',
    yourTurnBody: '{partner} が選択しました。「{story}」を続けましょう。',
    reminderTitle: '{partner} が待っています',
    reminderBody: '「{story}」はまだあなたの番です。続きから再開しましょう。',
  },
  ko: {
    yourTurnTitle: '당신 차례예요',
    yourTurnBody: '{partner} 님이 선택했어요. 「{story}」를 이어가세요.',
    reminderTitle: '{partner} 님이 기다리고 있어요',
    reminderBody: '「{story}」에서 아직 당신 차례예요. 이어서 진행해 보세요.',
  },
  pt: {
    yourTurnTitle: 'É a sua vez',
    yourTurnBody: '{partner} jogou. Continue «{story}».',
    reminderTitle: '{partner} está à sua espera',
    reminderBody: 'Ainda é a sua vez em «{story}». Continue de onde parou.',
  },
  ru: {
    yourTurnTitle: 'Твой ход',
    yourTurnBody: '{partner} сделал ход. Продолжай «{story}».',
    reminderTitle: '{partner} ждёт тебя',
    reminderBody: 'В «{story}» всё ещё твой ход. Продолжи с того места, где остановился.',
  },
  zh: {
    yourTurnTitle: '轮到你了',
    yourTurnBody: '{partner} 已经做出选择，继续《{story}》吧。',
    reminderTitle: '{partner} 在等你',
    reminderBody: '《{story}》中仍然轮到你，继续之前的故事吧。',
  },
};

/**
 * "tr-TR" / "TR" / "zh-Hans" gibi girdileri desteklenen locale'e indirger.
 * Bilinmeyen değerlerde DEFAULT_LOCALE ('en') döner.
 */
export function normalizeLocale(raw?: string | null): SupportedLocale {
  if (!raw) return DEFAULT_LOCALE;
  const base = raw.trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base)
    ? (base as SupportedLocale)
    : DEFAULT_LOCALE;
}

export function turnNotificationTexts(locale?: string | null): TurnNotificationStrings {
  return TEXTS[normalizeLocale(locale)];
}

export function fillTemplate(
  template: string,
  values: { partner: string; story: string },
): string {
  return template.replace('{partner}', values.partner).replace('{story}', values.story);
}
