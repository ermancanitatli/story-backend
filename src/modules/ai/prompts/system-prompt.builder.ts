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
  // Multiplayer'da aynı dilde olsalar bile her oyuncu kendi gözünden sahne görmeli.
  // true: response'ta scenes.host + scenes.guest ayrı perspective ile döner (tek dil).
  // false: tek sahne currentScene'e yazılır (non-multiplayer).
  requireDualPerspectiveSameLang?: boolean;

  // === Chapter transition controls ===
  // 'entering': chapter boundary'yi geçip yeni chapter'ın ilk sahnesini üretirken kullanılır.
  // 'none' (default): normal akış.
  transitionMode?: 'none' | 'entering';

  // Yapılandırılmış yönetmen direktifi (admin panel'den). AI bu alanları hammadde olarak kullanır.
  transitionDirective?: TransitionDirective;

  // Transition modunda recent history YERİNE kullanılan 1-2 cümlelik bridge summary.
  // Cache'lenir (session.bridgeSummaries). Raw history'nin recency bias'ını kırar.
  previousChapterBridge?: string;

  // === Rolling summary + chapter bridges (memory tiers) ===
  // rollingSummary: mevcut chapter içinde son 2 sahne hariç önceki sahnelerin özeti.
  // chapterBridges: geçmiş chapter'ların tek cümlelik özetleri (sıralı).
  // İkisi de boşsa recentHistory array'i 10 sahne raw olarak basılır (backward compat).
  rollingSummary?: string;
  chapterBridges?: string[];

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

## Player Character (PROTAGONIST — "you"):
${(() => {
  const chars = params.characters || [];
  const main = chars.find((c: any) => {
    const role = (c.role || '').toLowerCase();
    return role === 'main' || role === 'protagonist' || role === 'player' || role === 'user';
  });
  const mainGender = main?.gender || 'unknown';
  const playerGender = params.playerGender || mainGender;
  const playerName = params.playerName || main?.name || 'Player';
  if (main) {
    return `- **${playerName}** (${playerGender}, ${main.role || 'protagonist'})\n  Description: ${main.description || 'No description'}\n  NOTE: The player IS this character. Use the name "${playerName}" — do NOT call them "${main.name}" (the original story name is replaced by the player's name). Write scenes in second person ("you") from this character's perspective.`;
  }
  return `- **${playerName}** (${playerGender}, protagonist)\n  NOTE: Write scenes in second person ("you") from this character's perspective.`;
})()}

## Other Characters (NPCs):
${(() => {
  const chars = params.characters || [];
  const main = chars.find((c: any) => {
    const role = (c.role || '').toLowerCase();
    return role === 'main' || role === 'protagonist' || role === 'player' || role === 'user';
  });
  const npcs = chars.filter((c: any) => c !== main);
  if (npcs.length === 0) return '(none — this is a solo scene)';
  return npcs.map((c: any) => `- ${c.name}: ${c.description || 'No description'} (${c.gender || 'unknown'}, ${c.role || 'npc'})`).join('\n');
})()}

## Current Chapter: ${params.currentChapter}${params.chapterTitle ? ` - ${params.chapterTitle}` : ''}
${params.chapterSummary || ''}

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
2. The player character (protagonist) is addressed as "you" — use the player's name when other characters speak to them
3. Do NOT use the original story protagonist name if it was replaced by the player's name (see "Player Character" section above)
4. Provide exactly 4 choices with different types (action, dialogue, exploration, decision)
5. Each choice should have meaningful consequences
6. Include emotional changes (-5 to +5) in effects
7. Track items gained/lost
8. Use isEnding=true only when the story reaches a natural conclusion
9. endingType: victory, defeat, neutral, or cliffhanger
10. MANDATORY FIELD: effects.suggestChapterTransition MUST be a boolean (true or false). NEVER omit this field. NEVER leave it null. Default false unless pacing instructions below say otherwise.

## Choice design — diversity + trajectory amplification (MANDATORY)
The 4 choices are the player's next-turn action menu. Follow these rules strictly:
- Each choice must lead to a VISIBLY different next scene (different tone, target, or mechanism). Never produce four rewordings of the same idea.
- **3 of the 4 choices** must AMPLIFY the player's dominant trajectory (see USER TRAJECTORY in the user message). They deepen, escalate, or explore the thematic direction the player has been pursuing — in varied ways (e.g. escalate intensity vs. turn inward vs. broaden scope). When the trajectory is clear, lean HARDER into it each turn.
- **1 of the 4 choices** MUST be an ALTERNATIVE DIRECTION — a plausible, in-character option that steps aside from the dominant trajectory and opens a different thematic path. This is the player's exit ramp to reshape the story. It must feel natural, never forced.
- Do NOT label, tag, or annotate which choice is amplify vs. alternative. The player sees only the action text.
- When the user's intent is clear (e.g. pursuit, retreat, curiosity, confrontation), let the currentScene's details (sensory, emotional, environmental) respond to that pull — the world should feel like it is bending toward what the player wants.`;

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

## Pacing — Chapter Length Awareness
This chapter has developed enough content for a natural closing to become possible.
Continue the story NATURALLY. Do NOT rush to close the chapter.

Only set effects.suggestChapterTransition=true if the CURRENT scene you just wrote is organically a strong chapter ending, such as:
  • A major emotional peak that just resolved (kiss, reveal, decision made)
  • A character leaving the scene or location naturally
  • A clear time/focus shift emerging from the scene itself
  • A dramatic pause or cliffhanger that the writing itself produces

If the scene is still mid-action, mid-conversation, or mid-tension: effects.suggestChapterTransition=false.
Prefer false unless the chapter truly wants to close. Let the story breathe.

MANDATORY: effects.suggestChapterTransition must be a boolean (true or false).`;
  } else if (params.pacingHint === 'pressure') {
    prompt += `

## Pacing — Time to Wind Down
The chapter has run long. Begin guiding the narrative toward a graceful close within the next 1-2 scenes.

This scene should:
  • Resolve or pause the active emotional thread (don't leave mid-sentence tensions)
  • Avoid introducing new characters, new settings, or new mysteries
  • Move toward a beat that allows a natural chapter end

If this scene produces a clean closing moment: effects.suggestChapterTransition=true.
If the scene still needs one more beat to close properly: effects.suggestChapterTransition=false, but keep this scene focused on wind-down.

MANDATORY: effects.suggestChapterTransition must be a boolean.`;
  } else {
    // pacingHint === 'none' — normal akış
    prompt += `

## Pacing — Normal
Develop the story freely. MANDATORY: effects.suggestChapterTransition = false.`;
  }

  if (censor) {
    prompt += `
9. CENSORSHIP: Keep content PG-13. No explicit sexual content, graphic violence, or hate speech.`;
  }

  if (params.isMultiplayer) {
    const hostN = params.hostName || 'Host';
    const guestN = params.guestName || 'Guest';
    const activeName = params.activePlayerName || hostN;
    const otherName = activeName === hostN ? guestN : hostN;

    if (isBilingual) {
      // BILINGUAL: her dil ayrı bir oyuncunun perspective'i
      // languages[0] = host language → host'un gözünden (host="you")
      // languages[1] = guest language → guest'in gözünden (guest="you")
      const l0 = languages[0];
      const l1 = languages[1];
      prompt += `

## Multiplayer Mode — BILINGUAL DUAL PERSPECTIVE (CRITICAL):
- Host (player 1): ${hostN} — speaks ${getLanguageName(l0)} (${l0})
- Guest (player 2): ${guestN} — speaks ${getLanguageName(l1)} (${l1})
- **ACTIVE PLAYER this turn: ${activeName}** — their choice drives what happens in the scene.
- Both are REAL players who REPLACE the story's original characters. NEVER use original names — only "${hostN}" and "${guestN}".

### CRITICAL: "scenes" field must contain TWO DIFFERENT perspectives of the SAME event.

- \`scenes.${l0}\` → written in ${getLanguageName(l0)} from **${hostN}'s** point of view ("you" = ${hostN}, ${guestN} = third person).
- \`scenes.${l1}\` → written in ${getLanguageName(l1)} from **${guestN}'s** point of view ("you" = ${guestN}, ${hostN} = third person).

They describe the SAME moment, but through each player's own eyes. NOT a translation of the same sentence.

Example — if ${activeName} just chose to say "Focus on your breath" to the other:

  scenes.${l0} (${hostN}'s view):
    ${activeName === hostN
      ? `"You gently approach ${guestN} and say, 'Focus on your breath.' ${guestN} looks up at you and smiles."`
      : `"${guestN} walks toward you and says softly, 'Focus on your breath.' You look up and meet their gaze."`}

  scenes.${l1} (${guestN}'s view):
    ${activeName === guestN
      ? `"You approach ${hostN} and say, 'Focus on your breath.' ${hostN} looks up with a warm smile."`
      : `"${hostN} steps closer and whispers, 'Focus on your breath.' You feel their calm presence and smile back."`}

### Choices (4 per language):
- \`choices.${l0}\` → actions/dialogues the NEXT active player will choose from, in ${getLanguageName(l0)}.
- \`choices.${l1}\` → SAME choices translated to ${getLanguageName(l1)} (consistent meaning).
- Choices are for the NEXT player to act (turn swap happens after this scene).

### Absolute rules:
- Do NOT write both scenes from the same perspective.
- Do NOT say "You" referring to the same person in both languages — "you" switches based on the scene's owner.
- Do NOT use original story character names — only "${hostN}" and "${guestN}".`;
    } else if (params.requireDualPerspectiveSameLang) {
      // SAME-LANGUAGE multiplayer — iki oyuncu aynı dilde ama iki ayrı perspective gerekli
      const lang = languages[0];
      prompt += `

## Multiplayer Mode — SAME-LANGUAGE DUAL PERSPECTIVE (CRITICAL):
- Host (player 1): ${hostN}
- Guest (player 2): ${guestN}
- **Both play in ${getLanguageName(lang)}.**
- **ACTIVE PLAYER this turn: ${activeName}** — their choice drives what happens.
- Both are REAL players who REPLACE the story's original characters. NEVER use original names.

### CRITICAL: scenes field must contain TWO DIFFERENT perspectives of the SAME event, BOTH in ${getLanguageName(lang)}.

- \`scenes.host\` → written from **${hostN}'s** POV in ${getLanguageName(lang)} ("sen" = ${hostN}, ${guestN} = 3rd person).
- \`scenes.guest\` → written from **${guestN}'s** POV in ${getLanguageName(lang)} ("sen" = ${guestN}, ${hostN} = 3rd person).

They describe the SAME moment, but through each player's own eyes.

Example — if ${activeName} chose "Esra'nın belini düzelt":

  scenes.host (${hostN}'s view):
    ${activeName === hostN
      ? `"${guestN}'a yaklaşıyorsun ve nazikçe belini düzeltiyorsun. ${guestN} sana dönüp gülümsüyor, 'Teşekkürler' diyor."`
      : `"${guestN} sana yaklaşıyor ve nazikçe belini düzeltiyor. Sen ona dönüp gülümsüyorsun, 'Teşekkürler' diyorsun."`}

  scenes.guest (${guestN}'s view):
    ${activeName === guestN
      ? `"${hostN}'a yaklaşıyorsun ve nazikçe belini düzeltiyorsun. ${hostN} sana dönüp gülümsüyor, 'Teşekkürler' diyor."`
      : `"${hostN} sana yaklaşıyor ve nazikçe belini düzeltiyor. Sen ona dönüp gülümsüyorsun, 'Teşekkürler' diyorsun."`}

### Choices (4 total, SAME for both — next player's action options):
- \`choices\` → array of 4 choices in ${getLanguageName(lang)}.

### Absolute rules:
- scenes.host and scenes.guest MUST describe the same event from different POVs — NOT identical text.
- "sen" switches based on which scene's owner.
- NEVER use original story character names.

### MANDATORY chain-of-thought (fill these BEFORE writing scenes):
- "active_player_confirmation" MUST equal "${activeName}" — literal name match.
- "host_pov_you_refers_to" MUST equal "${hostN}" — in scenes.host, "sen" = ${hostN}.
- "guest_pov_you_refers_to" MUST equal "${guestN}" — in scenes.guest, "sen" = ${guestN}.
These fields are proof of perspective awareness. If you write them correctly but then output identical scenes, the response is rejected.

### ANTI-PATTERNS (response REJECTED if ANY match):
  ✗ scenes.host === scenes.guest (byte-for-byte identical text)
  ✗ Both scenes use "sen" referring to SAME person (e.g., both say "${hostN}'a yaklaşıyorsun")
  ✗ scenes.host says "${hostN}'a yaklaşıyorsun" (wrong — ${hostN} is "sen" in host POV, NOT an object)
  ✗ scenes.guest says "${guestN}'a yaklaşıyorsun" (wrong — ${guestN} is "sen" in guest POV)
  ✗ scenes.host and scenes.guest differ ONLY in pronouns/names — deeper experiential difference required
  ✗ Copy-pasting scenes.host into scenes.guest field

### Remember: 4 choices are the NEXT player's action menu.`;
    } else {
      // SINGLE LANGUAGE multiplayer — sadece aktif oyuncunun dili (eski davranış, nadir kullanım)
      prompt += `

## Multiplayer Mode — PERSPECTIVE RULES (CRITICAL):
- Host (player 1): ${hostN}
- Guest (player 2): ${guestN}
- **ACTIVE PLAYER (this turn's POV): ${activeName}**
- Both host and guest are REAL players who REPLACE the original story characters. NEVER use original names.

### Perspective for THIS scene:
- Written from **${activeName}'s** point of view, in second person ("you" = ${activeName}).
- ${otherName} is the OTHER character — describe their actions/dialogue/appearance from ${activeName}'s eyes.
- Do NOT write "${activeName}" in third person; "${activeName}" is "you".

Example:
  ✓ "${otherName} looks at you and smiles, '${activeName}, come closer.'"
  ✓ "You feel ${otherName}'s hand on your shoulder."
  ✗ "${activeName} looks at ${otherName}" (wrong)
  ✗ "${otherName}'s heart races as she watches ${activeName}" (wrong — POV leak)

The 4 choices are the NEXT active player's possible actions.`;
    }
  }

  // === CHAIN-OF-THOUGHT: acknowledged_directive self-restate ===
  if (isTransition) {
    prompt += `

## Mandatory thinking step (transition mode):
Before composing currentScene, populate \`acknowledged_directive\` with ONE sentence restating the DIRECTOR DIRECTIVE in your own words. Then compose currentScene that FULFILLS that restatement. If your acknowledged_directive is missing or generic, the response will be rejected.`;
  }

  // === RESPONSE FORMAT ===
  if (!isBilingual && params.requireDualPerspectiveSameLang) {
    const lang = languages[0];
    prompt += `

## Response Format (JSON):
{
  "scene_type": "${isTransition ? 'chapter_transition' : 'continuation'}",
  "acknowledged_directive": "${isTransition ? 'REQUIRED: one-sentence restatement of director directive in English' : 'optional'}",
  "active_player_confirmation": "MUST equal active player's literal name (proof of awareness)",
  "host_pov_you_refers_to": "MUST equal host's literal name (in scenes.host, 'sen' refers to this person)",
  "guest_pov_you_refers_to": "MUST equal guest's literal name (in scenes.guest, 'sen' refers to this person)",
  "scenes": {
    "host": "scene from HOST's POV in ${getLanguageName(lang)} (host is 'sen', 3-5 sentences)",
    "guest": "scene from GUEST's POV in ${getLanguageName(lang)} (guest is 'sen', 3-5 sentences); SAME EVENT, DIFFERENT PERSPECTIVE — NOT identical text"
  },
  "choices": [
    {"id": "1", "text": "NEXT active player's action in ${getLanguageName(lang)}", "type": "action"},
    {"id": "2", "text": "...", "type": "dialogue"},
    {"id": "3", "text": "...", "type": "exploration"},
    {"id": "4", "text": "...", "type": "decision"}
  ],
  "effects": {
    "itemsGained": [],
    "itemsLost": [],
    "relationshipChanges": {},
    "emotionalChanges": {"intimacy":0,"anger":0,"worry":0,"trust":0,"excitement":0,"sadness":0},
    "suggestChapterTransition": false
  },
  "isEnding": false,
  "endingType": null
}`;
  } else if (isBilingual) {
    const l0 = languages[0];
    const l1 = languages[1];
    prompt += `

## Response Format (JSON):
{
  "scene_type": "${isTransition ? 'chapter_transition' : 'continuation'}",
  "acknowledged_directive": "${isTransition ? 'REQUIRED: one-sentence restatement of director directive in English' : 'optional'}",
  "scenes": {
    "${l0}": "scene from FIRST player's POV in ${getLanguageName(l0)} (they are 'you')",
    "${l1}": "scene from SECOND player's POV in ${getLanguageName(l1)} (they are 'you'); SAME EVENT, DIFFERENT PERSPECTIVE — NOT a translation"
  },
  "choices": {
    "${l0}": [
      {"id": "1", "text": "NEXT active player's action in ${getLanguageName(l0)}", "type": "action"},
      {"id": "2", "text": "dialogue option in ${getLanguageName(l0)}", "type": "dialogue"},
      {"id": "3", "text": "exploration option in ${getLanguageName(l0)}", "type": "exploration"},
      {"id": "4", "text": "decision option in ${getLanguageName(l0)}", "type": "decision"}
    ],
    "${l1}": [
      {"id": "1", "text": "SAME 4 choices translated to ${getLanguageName(l1)} with consistent meaning", "type": "action"},
      {"id": "2", "text": "...", "type": "dialogue"},
      {"id": "3", "text": "...", "type": "exploration"},
      {"id": "4", "text": "...", "type": "decision"}
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
  // === Memory tiers ===
  rollingSummary?: string;
  chapterBridges?: string[];
  // === Multiplayer dual POV reminder (tail sandwich) ===
  multiplayerDualPov?: {
    hostName: string;
    guestName: string;
    activeName: string;
  };
  // === User trajectory — intent amplification ===
  // Son N kullanıcı seçiminin text'i, en eski → en yeni. Boş bırakılırsa blok render edilmez.
  recentUserChoices?: string[];
}): string {
  if (params.type === 'start') {
    return 'Begin the story. Set the scene and present the first set of choices.';
  }

  const isTransition = params.transitionMode === 'entering';

  let message = '';

  if (isTransition && params.previousChapterBridge) {
    // Transition modu: bridge özet devrede, tier'ları kullanma
    message += `## Archived Past Events (previous chapter, CLOSED)\n${params.previousChapterBridge}\n\n`;
  } else {
    // Normal akış: 3 katmanlı memory
    // Tier 3 — chapter bridges (önceki chapter'ların özetleri)
    if (params.chapterBridges && params.chapterBridges.length > 0) {
      message += `## Story So Far (previous chapters, archived — do not mimic this prose style)\n${params.chapterBridges.join('\n')}\n\n`;
    }
    // Tier 2 — current chapter rolling summary
    if (params.rollingSummary && params.rollingSummary.trim().length > 0) {
      message += `## Recent Events (earlier in this chapter, summarized)\n${params.rollingSummary}\n\n`;
    }
    // Tier 1 — son sahneler raw
    if (params.recentHistory && params.recentHistory.length > 0) {
      const tierLabel =
        (params.chapterBridges && params.chapterBridges.length > 0) ||
        (params.rollingSummary && params.rollingSummary.trim().length > 0)
          ? '## Immediate Scenes (verbatim — mirror this tone and style)'
          : '## Recent story context:';
      message += `${tierLabel}\n${params.recentHistory.join('\n')}\n\n`;
    }
  }

  // USER TRAJECTORY — son seçimler, AI niyet çıkarıp hikayeyi o yöne derinleştirsin.
  const trajectory = (params.recentUserChoices || [])
    .map((c) => (c || '').trim())
    .filter(Boolean);
  if (trajectory.length > 0) {
    const lines = trajectory.map((c, i) => `  ${i + 1}. "${c}"`).join('\n');
    message += `## USER TRAJECTORY (oldest → newest)\n${lines}\n\n`;
    message += `Infer the dominant intent behind these choices (the emotional thread, thematic direction, or behavioral pattern the player is steering toward). Then:\n`;
    message += `  1. Let this intent color currentScene — emphasize consequences, reactions, and sensory details that resonate with the trajectory. The world should feel like it is bending toward what the player wants.\n`;
    message += `  2. Lean HARDER into the dominant direction with each turn. Avoid vanilla neutral beats when the trajectory is clear.\n`;
    message += `  3. Apply the "Choice design" rule strictly: 3 choices amplify/deepen this direction in varied ways, 1 offers an alternative thematic path.\n\n`;
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

  // === Multiplayer dual POV — tail sandwich reminder ===
  // Prompt sonu = en yüksek recency bias. Aktif oyuncu ve POV mapping'i
  // burada tekrarla ki Grok history'deki tek-POV pattern'ini kırabilsin.
  if (params.multiplayerDualPov) {
    const { hostName, guestName, activeName } = params.multiplayerDualPov;
    message += `\n\n[DUAL POV REMINDER — highest priority, end of prompt]\n`;
    message += `Active this turn: ${activeName}\n`;
    message += `scenes.host → "sen" = ${hostName} (${guestName} is 3rd person)\n`;
    message += `scenes.guest → "sen" = ${guestName} (${hostName} is 3rd person)\n`;
    message += `scenes.host and scenes.guest MUST be DIFFERENT TEXT describing the same event from each player's own eyes.\n`;
    message += `Fill "active_player_confirmation", "host_pov_you_refers_to", "guest_pov_you_refers_to" correctly BEFORE writing scenes.`;
  }

  return message;
}
