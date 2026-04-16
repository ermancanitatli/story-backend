/**
 * Grok system prompt builder — Cloud Functions index.ts 2454-2532'den port edildi.
 * 50 choice category, 12 dil desteği, PG-13 sansür kuralları.
 */

const CHOICE_CATEGORIES = [
  'romantic gesture', 'bold confession', 'secret reveal', 'protective instinct',
  'jealous reaction', 'mysterious approach', 'playful tease', 'daring challenge',
  'vulnerable admission', 'passionate declaration', 'unexpected alliance',
  'dangerous choice', 'forbidden path', 'emotional breakdown', 'heroic sacrifice',
  'strategic deception', 'trust test', 'loyalty dilemma', 'power play',
  'gentle comfort', 'dramatic confrontation', 'silent observation', 'risky gamble',
  'compassionate decision', 'vengeful act', 'diplomatic solution', 'creative escape',
  'moral compromise', 'innocent question', 'worldly wisdom', 'natural instinct',
  'calculated risk', 'spontaneous adventure', 'quiet reflection', 'bold assertion',
  'humble request', 'defiant stand', 'peaceful resolution', 'chaotic impulse',
  'methodical approach', 'intuitive leap', 'social maneuver', 'physical challenge',
  'intellectual puzzle', 'emotional appeal', 'practical solution', 'idealistic dream',
  'grounded decision', 'whimsical fancy', 'stoic endurance',
];

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  en: 'Write all content in English.',
  tr: 'Tüm içerikleri Türkçe yaz.',
  ar: 'اكتب كل المحتوى باللغة العربية.',
  de: 'Schreibe alle Inhalte auf Deutsch.',
  es: 'Escribe todo el contenido en español.',
  fr: 'Écris tout le contenu en français.',
  it: 'Scrivi tutti i contenuti in italiano.',
  ja: 'すべてのコンテンツを日本語で書いてください。',
  ko: '모든 콘텐츠를 한국어로 작성하세요.',
  pt: 'Escreva todo o conteúdo em português.',
  ru: 'Пишите весь контент на русском языке.',
  zh: '用中文撰写所有内容。',
};

function pickRandomCategories(count: number = 4): string[] {
  const shuffled = [...CHOICE_CATEGORIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export interface PromptParams {
  storyTitle: string;
  storySummary: string;
  characters: { name: string; description?: string; gender?: string; role?: string }[];
  currentChapter: number;
  chapterTitle?: string;
  chapterSummary?: string;
  playerName?: string;
  playerGender?: string;
  languageCode?: string;
  emotionalStates?: Record<string, number>;
  censorship?: boolean; // PG-13 default
  recentHistory?: string[];
  isMultiplayer?: boolean;
  hostName?: string;
  guestName?: string;
  activePlayerName?: string;
}

export function buildSystemPrompt(params: PromptParams): string {
  const categories = pickRandomCategories(4);
  const lang = params.languageCode || 'en';
  const langInstruction = LANGUAGE_INSTRUCTIONS[lang] || LANGUAGE_INSTRUCTIONS['en'];
  const censor = params.censorship !== false;

  let prompt = `You are an interactive story narrator. You create engaging, immersive story scenes with meaningful choices.

${langInstruction}

## Story: ${params.storyTitle}
${params.storySummary}

## Characters:
${params.characters.map((c) => `- ${c.name}: ${c.description || 'No description'} (${c.gender || 'unknown'}, ${c.role || 'unknown'})`).join('\n')}

## Current Chapter: ${params.currentChapter}${params.chapterTitle ? ` - ${params.chapterTitle}` : ''}
${params.chapterSummary || ''}

## Player: ${params.playerName || 'Player'}${params.playerGender ? ` (${params.playerGender})` : ''}

## Choice Categories for this scene (use ${categories.length} of these):
${categories.map((c) => `- ${c}`).join('\n')}

## Emotional States:
${
  params.emotionalStates
    ? Object.entries(params.emotionalStates)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
    : 'All neutral (0)'
}

## Rules:
1. Write currentScene as 3-5 sentences, vivid and immersive
2. Provide exactly 4 choices with different types (action, dialogue, exploration, decision)
3. Each choice should have meaningful consequences
4. Include emotional changes (-5 to +5) in effects
5. Track items gained/lost
6. After 8 steps in a chapter, consider a chapter transition
7. Use isEnding=true only when the story reaches a natural conclusion
8. endingType: victory, defeat, neutral, or cliffhanger`;

  if (censor) {
    prompt += `
9. CENSORSHIP: Keep content PG-13. No explicit sexual content, graphic violence, or hate speech.`;
  }

  if (params.isMultiplayer) {
    prompt += `

## Multiplayer Mode:
- Host: ${params.hostName || 'Host'}
- Guest: ${params.guestName || 'Guest'}
- Active player perspective: ${params.activePlayerName || 'Host'}
- Write the scene from the active player's perspective`;
  }

  prompt += `

## Response Format (JSON):
{
  "currentScene": "string",
  "choices": [
    {"id": "1", "text": "string", "type": "action|dialogue|exploration|decision"},
    {"id": "2", "text": "string", "type": "action|dialogue|exploration|decision"},
    {"id": "3", "text": "string", "type": "action|dialogue|exploration|decision"},
    {"id": "4", "text": "string", "type": "action|dialogue|exploration|decision"}
  ],
  "effects": {
    "itemsGained": [],
    "itemsLost": [],
    "relationshipChanges": {},
    "emotionalChanges": {"intimacy":0,"anger":0,"worry":0,"trust":0,"excitement":0,"sadness":0}
  },
  "isEnding": false,
  "endingType": null
}`;

  return prompt;
}

export function buildUserMessage(params: {
  type: 'start' | 'continue';
  userChoice?: string;
  recentHistory?: string[];
}): string {
  if (params.type === 'start') {
    return 'Begin the story. Set the scene and present the first set of choices.';
  }

  let message = '';
  if (params.recentHistory && params.recentHistory.length > 0) {
    message += `Recent story context:\n${params.recentHistory.join('\n')}\n\n`;
  }
  message += `The player chose: "${params.userChoice}"\n\nContinue the story based on this choice.`;
  return message;
}
