/**
 * Grok system prompt builder — screenwriter/director framing.
 *
 * Chapter transition sorunu: admin summary'si recent history ile çelişince
 * Grok recent history'ye yapışıyordu. Çözüm:
 *  - Director metaphor (AI = yönetmen direktifini uygulayan senaryocu)
 *  - XML/markdown yapısal hiyerarşi (chapter directive > archived history)
 *  - Prompt sandwich (direktif hem başta hem user mesaj sonunda tekrarlanır)
 *  - Chain-of-thought + structured output (acknowledged_directive alanı)
 *  - Bridge summary (raw history yerine 1-2 cümle özet)
 *
 * Kaynaklar: Anthropic context engineering, OpenAI instruction hierarchy paper,
 * Lost in the Middle (arxiv 2307.03172), AI Dungeon Author's Note pattern.
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

const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  english: 'en', turkish: 'tr', arabic: 'ar', german: 'de',
  spanish: 'es', french: 'fr', italian: 'it', japanese: 'ja',
  korean: 'ko', portuguese: 'pt', russian: 'ru', chinese: 'zh',
};

function normalizeLanguageCode(input?: string): string {
  if (!input) return 'en';
  const trimmed = input.trim().toLowerCase();
  if (LANGUAGE_INSTRUCTIONS[trimmed]) return trimmed;
  if (LANGUAGE_NAME_TO_CODE[trimmed]) return LANGUAGE_NAME_TO_CODE[trimmed];
  const baseCode = trimmed.split(/[-_]/)[0];
  return LANGUAGE_INSTRUCTIONS[baseCode] ? baseCode : 'en';
}

function pickRandomCategories(count: number = 4): string[] {
  const shuffled = [...CHOICE_CATEGORIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    en: 'English', tr: 'Turkish', ar: 'Arabic', de: 'German',
    es: 'Spanish', fr: 'French', it: 'Italian', ja: 'Japanese',
    ko: 'Korean', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese',
  };
  return names[code] || 'English';
}

export interface TransitionDirective {
  timeDelta?: string;
  location?: string;
  mood?: string;
  carryOver?: string;
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
  languages?: string[];
  emotionalStates?: Record<string, number>;
  censorship?: boolean;
  recentHistory?: string[];
  isMultiplayer?: boolean;
  hostName?: string;
  guestName?: string;
  activePlayerName?: string;

  // === Chapter transition controls ===
  // 'entering': chapter boundary'yi geçip yeni chapter'ın ilk sahnesini üretirken kullanılır.
  // 'none' (default): normal akış.
  transitionMode?: 'none' | 'entering';

  // Yapılandırılmış yönetmen direktifi (admin panel'den). AI bu alanları hammadde olarak kullanır.
  transitionDirective?: TransitionDirective;

  // Transition modunda recent history YERİNE kullanılan 1-2 cümlelik bridge summary.
  // Cache'lenir (session.bridgeSummaries). Raw history'nin recency bias'ını kırar.
  previousChapterBridge?: string;

  // === Pacing control (chapter transition timing) ===
  // 'none'     → AI'a pacing sinyali gönderme, normal akış
  // 'soft'     → min step'e ulaştık, AI "doğal kapanış mı?" değerlendirsin (suggestChapterTransition flag döndürebilir)
  // 'pressure' → soft step'i aştık, AI hikayeyi chapter kapanışına yönlendirsin
  pacingHint?: 'none' | 'soft' | 'pressure';

  // Son chapter — transition/kapanış baskısı YOK, hikaye sonsuz devam etsin
  isLastChapter?: boolean;
  totalChapters?: number;
}

/**
 * System prompt — chapter directive prompt'un en başında (recency bias tersi yönünde),
 * ayrıca user message sonunda reminder olarak tekrarlanır (sandwich pattern).
 */
export function buildSystemPrompt(params: PromptParams): string {
  const categories = pickRandomCategories(4);
  const rawLanguages = params.languages || [params.languageCode || 'en'];
  const languages = rawLanguages.map(normalizeLanguageCode);
  const isBilingual = languages.length > 1;
  const censor = params.censorship !== false;
  const isTransition = params.transitionMode === 'entering';

  let langInstruction: string;
  if (isBilingual) {
    const lang1Name = getLanguageName(languages[0]);
    const lang2Name = getLanguageName(languages[1]);
    langInstruction = `Write ALL scene text and choice texts in BOTH ${lang1Name} (${languages[0]}) and ${lang2Name} (${languages[1]}). Use the bilingual response format shown below.`;
  } else {
    langInstruction = LANGUAGE_INSTRUCTIONS[languages[0]] || LANGUAGE_INSTRUCTIONS['en'];
  }

  // === ROLE + DIRECTOR FRAMING ===
  let prompt = `You are a senior screenwriter executing a director's shot list for an interactive drama. You compose vivid scenes, but you STRICTLY obey any DIRECTOR DIRECTIVE you are given — directives are authoritative and override any conflicting context from earlier scenes. Treat "Recent events" or "Archived past events" as closed history, not the current reality of the scene you are writing.

${langInstruction}`;

  // === CHAPTER BOUNDARY BLOCK (if entering a new chapter) ===
  if (isTransition) {
    const d = params.transitionDirective || {};
    const lines: string[] = [];
    lines.push('');
    lines.push('=== CHAPTER BOUNDARY — NARRATIVE PIVOT ACTIVE ===');
    lines.push('[DIRECTOR DIRECTIVE — MUST OBEY]');
    if (d.timeDelta) lines.push(`- Time shift: ${d.timeDelta}`);
    if (d.location) lines.push(`- New location: ${d.location}`);
    if (d.mood) lines.push(`- Emotional tone: ${d.mood}`);
    if (d.carryOver) lines.push(`- Carry over from previous chapter: ${d.carryOver}`);
    if (!d.timeDelta && !d.location && !d.mood && !d.carryOver && params.chapterSummary) {
      lines.push(`- Context (authoritative): ${params.chapterSummary}`);
    }
    lines.push('');
    lines.push('This scene is an ESTABLISHING SHOT. Open with an explicit time-skip or location-change acknowledgment (e.g. "Three months later...", "Back at home..."), followed by sensory detail that PROVES the new context (lighting, sound, objects, weather).');
    lines.push('Do NOT continue the previous chapter\'s physical scene (location, ongoing action).');
    lines.push('Keep carry-over elements (emotions, relationships, memories) intact — only the physical state resets.');
    lines.push('=== END BOUNDARY ===');
    prompt += '\n' + lines.join('\n') + '\n';
  }

  prompt += `

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
6. Use isEnding=true only when the story reaches a natural conclusion
7. endingType: victory, defeat, neutral, or cliffhanger
8. MANDATORY FIELD: effects.suggestChapterTransition MUST be a boolean (true or false). NEVER omit this field. NEVER leave it null. Default false unless pacing instructions below say otherwise.`;

  // === CHAPTER PACING INSTRUCTIONS ===
  if (params.isLastChapter) {
    prompt += `

## Pacing — FINAL CHAPTER (Story End):
This is the STORY's FINAL chapter (${params.currentChapter}/${params.totalChapters}). There is NO next chapter.
- Do NOT force a chapter transition.
- Let the story breathe. When a natural narrative conclusion emerges, set isEnding=true.
- MANDATORY: effects.suggestChapterTransition = false (no next chapter exists, setting true is an error).`;
  } else if (params.pacingHint === 'soft') {
    prompt += `

## 🎬 CHAPTER CLOSING DECISION (Soft Window)
This chapter has reached its natural closing window (reached minimum steps for a full chapter arc).

YOU MUST DECIDE NOW:
Does this scene represent a fitting chapter end? A fitting end is:
  • A resolved emotional beat (confession, realization, decision)
  • A quiet reflective moment (pause, sigh, looking away)
  • A decision point that naturally transitions to a new time/place
  • A cliffhanger that begs a skip forward

→ If YES, the current scene IS the chapter's closing beat:
    • Write currentScene as a gentle closing moment (no new subplot, no unresolved hook dragging on)
    • MANDATORY: effects.suggestChapterTransition = true
    • The NEXT scene (not this one) will begin the next chapter automatically

→ If NO, continue the current arc:
    • MANDATORY: effects.suggestChapterTransition = false
    • Continue pacing naturally, but keep in mind the chapter should close soon

CRITICAL: effects.suggestChapterTransition MUST be a boolean (true or false). Silence / null / omission is an error and the response will be rejected.`;
  } else if (params.pacingHint === 'pressure') {
    prompt += `

## 🚨 CHAPTER CLOSING PRESSURE (Must Wrap Up)
This chapter has run LONGER than ideal and MUST close soon. The story is being dragged.

Your task for THIS scene:
  • Create a clear wind-down beat: complete the current emotional thread, introduce a pause, or hint at a scene shift
  • Do NOT introduce new subplots, new characters, or new open questions
  • Focus on resolving what is already open

Decision:
→ STRONGLY PREFER: effects.suggestChapterTransition = true
  (only write false if the scene truly cannot close — but explain in acknowledged_directive why)
→ If you MUST continue: keep the scene SHORT (2-3 sentences) and make it clearly transitional.

CRITICAL: effects.suggestChapterTransition MUST be a boolean. Silence / omission is a failure.`;
  } else {
    // pacingHint === 'none' — normal akış, yine de MANDATORY alan
    prompt += `

## Pacing — Normal Flow
Not yet in the chapter closing window. Continue developing the current arc normally.
MANDATORY: effects.suggestChapterTransition = false (not yet ready to close this chapter).`;
  }

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

  // === CHAIN-OF-THOUGHT: acknowledged_directive self-restate ===
  if (isTransition) {
    prompt += `

## Mandatory thinking step (transition mode):
Before composing currentScene, populate \`acknowledged_directive\` with ONE sentence restating the DIRECTOR DIRECTIVE in your own words. Then compose currentScene that FULFILLS that restatement. If your acknowledged_directive is missing or generic, the response will be rejected.`;
  }

  // === RESPONSE FORMAT ===
  if (isBilingual) {
    const l0 = languages[0];
    const l1 = languages[1];
    prompt += `

## Response Format (JSON):
{
  "scene_type": "${isTransition ? 'chapter_transition' : 'continuation'}",
  "acknowledged_directive": "${isTransition ? 'REQUIRED: one-sentence restatement of director directive in English' : 'optional'}",
  "scenes": {
    "${l0}": "scene text in first language",
    "${l1}": "scene text in second language"
  },
  "choices": {
    "${l0}": [
      {"id": "1", "text": "choice in first language", "type": "action"},
      {"id": "2", "text": "choice in first language", "type": "dialogue"},
      {"id": "3", "text": "choice in first language", "type": "exploration"},
      {"id": "4", "text": "choice in first language", "type": "decision"}
    ],
    "${l1}": [
      {"id": "1", "text": "choice in second language", "type": "action"},
      {"id": "2", "text": "choice in second language", "type": "dialogue"},
      {"id": "3", "text": "choice in second language", "type": "exploration"},
      {"id": "4", "text": "choice in second language", "type": "decision"}
    ]
  },
  "effects": {
    "itemsGained": [],
    "itemsLost": [],
    "relationshipChanges": {},
    "emotionalChanges": {"intimacy":0,"anger":0,"worry":0,"trust":0,"excitement":0,"sadness":0},
    "suggestChapterTransition": false  // MANDATORY boolean — see Pacing section above
  },
  "isEnding": false,
  "endingType": null
}`;
  } else {
    prompt += `

## Response Format (JSON):
{
  "scene_type": "${isTransition ? 'chapter_transition' : 'continuation'}",
  "acknowledged_directive": "${isTransition ? 'REQUIRED: one-sentence restatement of director directive in English' : 'optional'}",
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
    "emotionalChanges": {"intimacy":0,"anger":0,"worry":0,"trust":0,"excitement":0,"sadness":0},
    "suggestChapterTransition": false  // MANDATORY boolean — see Pacing section above
  },
  "isEnding": false,
  "endingType": null
}`;
  }

  return prompt;
}

/**
 * User mesajı — transition modunda raw history yerine bridge summary,
 * ve mesaj sonunda director directive'in tekrarı (recency bias lehimize).
 */
export function buildUserMessage(params: {
  type: 'start' | 'continue';
  userChoice?: string;
  recentHistory?: string[];
  transitionMode?: 'none' | 'entering';
  previousChapterBridge?: string;
  currentChapter?: number;
  transitionDirective?: TransitionDirective;
}): string {
  if (params.type === 'start') {
    return 'Begin the story. Set the scene and present the first set of choices.';
  }

  const isTransition = params.transitionMode === 'entering';

  let message = '';

  if (isTransition && params.previousChapterBridge) {
    // Raw history yerine bridge özet — "archived past events" olarak işaretli
    message += `## Archived Past Events (previous chapter, CLOSED)\n${params.previousChapterBridge}\n\n`;
  } else if (params.recentHistory && params.recentHistory.length > 0) {
    message += `## Recent story context:\n${params.recentHistory.join('\n')}\n\n`;
  }

  message += `The player chose: "${params.userChoice}"\n\n`;

  if (isTransition) {
    // === TAIL REMINDER (sandwich — prompt sonu recency bias lehimize) ===
    const d = params.transitionDirective || {};
    const directiveParts: string[] = [];
    if (d.timeDelta) directiveParts.push(`Time: ${d.timeDelta}`);
    if (d.location) directiveParts.push(`Location: ${d.location}`);
    if (d.mood) directiveParts.push(`Mood: ${d.mood}`);
    if (d.carryOver) directiveParts.push(`Carry over: ${d.carryOver}`);

    message += `[REMINDER — end of prompt, highest priority]\n`;
    message += `You are opening Chapter ${params.currentChapter}. The previous chapter's scene is CLOSED.\n`;
    if (directiveParts.length) {
      message += `Obey DIRECTOR DIRECTIVE: ${directiveParts.join(' | ')}\n`;
    }
    message += `First, fill acknowledged_directive with a one-sentence restatement. Then write currentScene as an ESTABLISHING SHOT fulfilling that directive. Do NOT continue the previous chapter's physical scene.`;
  } else {
    message += `Continue the story based on this choice.`;
  }

  return message;
}
