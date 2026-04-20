import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GrokResponse {
  // Tek dilli (geriye uyumlu)
  currentScene?: string;
  choices?: { id: string; text: string; type: string }[];
  // Çift dilli
  scenes?: Record<string, string>;
  localizedChoices?: Record<string, { id: string; text: string; type: string }[]>;
  // Ortak
  effects?: {
    emotionalChanges?: Record<string, number>;
    itemsGained?: string[];
    itemsLost?: string[];
    // AI'nın "bu sahne chapter için doğal bir kapanış" sinyali —
    // pacingHint='soft'|'pressure' modunda AI bunu true set eder, sonraki
    // step transition olarak işlem görür.
    suggestChapterTransition?: boolean;
  };
  isEnding?: boolean;
  endingType?: string;
  // Chapter transition guardrails
  scene_type?: 'chapter_transition' | 'continuation';
  acknowledged_directive?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  // Reasoning model — POV rewrite / instruction-heavy task'lar için.
  // Default grok-4-1-fast-reasoning ($0.20/$0.50 per 1M). Env'den override edilebilir.
  private readonly reasoningModel: string;

  constructor(private config: ConfigService) {
    this.apiUrl = this.config.get('GROK_API_URL', 'https://api.x.ai/v1/chat/completions');
    this.apiKey = this.config.get('GROK_API_KEY', '');
    this.model = this.config.get('GROK_MODEL', 'grok-4-fast-non-reasoning');
    this.reasoningModel = this.config.get(
      'GROK_REASONING_MODEL',
      'grok-4-1-fast-reasoning',
    );
  }

  /**
   * Türkçe/Latin karakterli kelimeleri regex için escape eder.
   * POV anonymization'da isimlerin regex metakarakter içermemesini garantiler.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Grok API çağrısı — Cloud Functions index.ts 2268-2636'dan port edildi.
   * 3 retry, her denemede +2000 token artışı.
   */
  async callGrokAPI(params: {
    systemPrompt: string;
    userMessage: string;
    maxRetries?: number;
    baseMaxTokens?: number; // default 4000. Dual perspective / bilingual için 6000-8000 öner
  }): Promise<GrokResponse> {
    const {
      systemPrompt,
      userMessage,
      maxRetries = 3,
      baseMaxTokens = 4000,
    } = params;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const maxTokens = baseMaxTokens + attempt * 2000;

      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.8,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Grok API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error('Empty response from Grok API');
        }

        const parsed = JSON.parse(content) as GrokResponse;

        // Bilingual key mapping: Grok returns "choices" as object but we expect "localizedChoices"
        if (parsed.scenes && parsed.choices && !Array.isArray(parsed.choices)) {
          parsed.localizedChoices = parsed.choices as any;
          parsed.choices = undefined;
        }

        // Validate required fields
        const hasSingleLang = parsed.currentScene && Array.isArray(parsed.choices);
        const hasBilingual =
          parsed.scenes &&
          typeof parsed.scenes === 'object' &&
          parsed.localizedChoices &&
          typeof parsed.localizedChoices === 'object';
        // Same-language dual perspective: scenes.host + scenes.guest + choices array
        const hasDualPerspective =
          parsed.scenes &&
          typeof parsed.scenes === 'object' &&
          ((parsed.scenes as any).host || (parsed.scenes as any).guest) &&
          Array.isArray(parsed.choices);
        if (!hasSingleLang && !hasBilingual && !hasDualPerspective) {
          throw new Error(
            'Invalid Grok response format: missing currentScene/choices or scenes/localizedChoices',
          );
        }

        this.logger.log(`Grok API success (attempt ${attempt + 1}, tokens: ${maxTokens})`);
        return parsed;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Grok API attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}`,
        );

        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 4000)); // 4s retry delay
        }
      }
    }

    throw lastError || new Error('Grok API failed after all retries');
  }

  /**
   * Rolling summary — chapter içinde eski sahneleri (son 2 hariç) özetler.
   * Hem single-player hem multiplayer'da kullanılır. Her 5 step'te async olarak
   * regenerate edilir. Eski summary varsa yenisiyle merge edilir (incremental).
   *
   * Language code hikayenin dili (tr/en/ar...) ile aynı olmalı — AI özet
   * metnini o dilde döndürür, böylece ana prompt'a enjekte edildiğinde
   * dil karışıklığı yaşanmaz.
   *
   * Hata durumunda boş string döner — service fallback raw history'ye düşer.
   */
  async summarizeRecentScenes(
    newScenes: string[],
    existingSummary?: string,
    languageCode?: string,
    isMultiplayer: boolean = false,
  ): Promise<string> {
    if (!newScenes || newScenes.length === 0) return '';

    const scenesText = newScenes
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n\n');

    const langInstruction = this.buildSummaryLanguageInstruction(languageCode);

    // Multiplayer: perspective-free (objective narrator) — iki oyuncuyu 3. şahıs
    // gözünden anlat, "sen/ben" yasak. Bu özet sonraki turn'de dual perspective
    // üretiminin input'u olduğu için POV-locked olmamalı.
    const povInstruction = isMultiplayer
      ? ' CRITICAL: Write in THIRD PERSON OBJECTIVE NARRATOR voice. Do NOT use "you" / "sen" / "I". Use character names (e.g. "Erman yaklaştı, Esra gülümsedi"). This summary is neutral memory for dual-perspective scene generation.'
      : '';

    const userContent = existingSummary
      ? `Previous rolling summary:\n${existingSummary}\n\nNew scenes to merge:\n${scenesText}\n\n` +
        `Update the summary incorporating the new scenes. Keep: character actions, decisions, promises made, key emotional shifts. Skip: atmospheric descriptions, weather, scenery. Output 2-4 sentences, past tense, factual tone, plain text only (no JSON, no bullets). ${langInstruction}${povInstruction}`
      : `Scenes:\n${scenesText}\n\nCompress into 2-4 sentences. Keep: character actions, decisions, promises, emotional shifts. Past tense, factual. Plain text only. ${langInstruction}${povInstruction}`;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                `You are a story editor. Produce concise factual summaries. Do not invent facts. Do not use dramatic prose. Plain narrative past tense only. ${langInstruction}${povInstruction}`,
            },
            { role: 'user', content: userContent },
          ],
          temperature: 0.2,
          max_tokens: 250,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(
          `summarizeRecentScenes failed (${response.status}): ${errorText}`,
        );
        return '';
      }

      const data = await response.json();
      return (data.choices?.[0]?.message?.content?.trim() || '') as string;
    } catch (err) {
      this.logger.warn(
        `summarizeRecentScenes error: ${(err as Error).message}`,
      );
      return '';
    }
  }

  /**
   * Chapter transition için "bridge summary" üretir — önceki chapter'ın son sahnelerini
   * 1-2 cümleye sıkıştırır, AI recency bias'ını kırmak için ana promptta raw history
   * yerine bu özet kullanılır. Tek seferlik çağrı, session.bridgeSummaries'e cache'lenir.
   */
  async summarizeForTransition(
    recentSceneText: string,
    languageCode?: string,
  ): Promise<string> {
    if (!recentSceneText || recentSceneText.trim().length === 0) {
      return '';
    }

    const langInstruction = this.buildSummaryLanguageInstruction(languageCode);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                `You are a story editor. Compress the given scenes into 1-2 sentences summarizing the key state at the end (location, emotional status, relationships). This summary will be used as "archived past events" — past tense, factual, no dialogue. Output plain text only, no JSON. ${langInstruction}`,
            },
            {
              role: 'user',
              content: `Scenes to compress:\n${recentSceneText}\n\n${langInstruction}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 150,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(
          `summarizeForTransition failed (${response.status}): ${errorText}`,
        );
        return '';
      }

      const data = await response.json();
      const content: string = data.choices?.[0]?.message?.content?.trim() || '';
      return content;
    } catch (err) {
      this.logger.warn(
        `summarizeForTransition error: ${(err as Error).message}`,
      );
      return '';
    }
  }

  /**
   * 3-Call Pipeline — Call 1: Event Orchestrator.
   * Tarafsız 3. şahıs vakanüvis: oyuncunun seçimi sonucu yaşanan olayı
   * "Erman yaklaştı, Esra gülümsedi" formatında anlatır. POV yok, "sen" yok.
   * Çıktıda choices, effects, isEnding, suggestChapterTransition JSON field'ları bulunur.
   * Bu chronicle sonraki iki paralel POV rewrite call'ının canonical input'udur.
   */
  async generateEventOrchestrator(params: {
    storyContext: string;
    choiceText: string;
    activePlayerName: string;
    nextPlayerName?: string; // Sıradaki aktif olacak oyuncu — choices o kişinin aksiyonu olmalı
    hostName: string;
    guestName: string;
    languageCode: string;
    pacingHint?: string;
    isLastChapter?: boolean;
  }): Promise<GrokResponse> {
    const langInstruction = this.buildSummaryLanguageInstruction(params.languageCode);

    // 3rd person örnek — hikaye dilinde (Türkçe)
    const langKey = (params.languageCode || 'en').toLowerCase().split(/[-_]/)[0];
    const goodExamples: Record<string, string> = {
      tr:
        `✅ DOĞRU: "${params.hostName} matın yanına geldi ve ${params.guestName}'a yaklaştı. ${params.guestName} ona bakarak gülümsedi."\n` +
        `❌ YANLIŞ: "Matın yanına geldim ve ${params.guestName}'a yaklaştım." (1. şahıs)\n` +
        `❌ YANLIŞ: "Matın yanına geldin ve ${params.guestName}'a yaklaştın." (2. şahıs)\n` +
        `❌ YANLIŞ: "Özet: ..." / "Erman'ın bakış açısından ..." (meta açıklama)`,
      en:
        `✅ CORRECT: "${params.hostName} walked to the mat and approached ${params.guestName}. ${params.guestName} looked at him and smiled."\n` +
        `❌ WRONG: "I walked to the mat..." (1st person)\n` +
        `❌ WRONG: "You walked to the mat..." (2nd person)\n` +
        `❌ WRONG: "Summary:..." / "From Erman's perspective..." (meta commentary)`,
    };
    const exampleBlock = goodExamples[langKey] || goodExamples.en;

    const systemPrompt =
      `${params.storyContext}\n\n` +
      `====================================================================\n` +
      `🔴 OVERRIDE — NEUTRAL EVENT CHRONICLER MODE (Pipeline Step 1 of 3)\n` +
      `====================================================================\n` +
      `IGNORE any earlier instruction about "dual perspective", "scenes.host/guest",\n` +
      `"ikinci şahıs", "1. şahıs anlatı" above. For THIS call you are a NEUTRAL\n` +
      `CHRONICLER ONLY. Separate POV rewriter calls (Step 2 & 3) will handle\n` +
      `first/second-person perspective afterward — do not do their job here.\n\n` +
      `Your ONLY job: describe WHAT HAPPENED as a result of ${params.activePlayerName}'s choice,\n` +
      `in 3rd-person objective narrator voice.\n\n` +
      `HARD RULES (VIOLATION → RESPONSE REJECTED):\n` +
      `1. eventChronicle MUST be 3rd person objective. Use names (${params.hostName}, ${params.guestName}).\n` +
      `2. FORBIDDEN pronouns/forms in eventChronicle:\n` +
      `   Turkish: "ben", "bana", "benim", "sen", "sana", "senin", "-dim/-dum/-ttim" endings\n` +
      `   English: "I", "me", "my", "you", "your"\n` +
      `3. NO meta text. NEVER write "Özet:", "Summary:", "From X's perspective:",\n` +
      `   "X'in bakış açısından", or ANY commentary about the scene. The chronicle IS the scene.\n` +
      `4. Describe observable events, dialogue, and visible emotions only.\n` +
      `   Internal thoughts/feelings belong to POV rewriters (Step 2/3), NOT you.\n` +
      `5. 3-5 sentences. Plain prose. No headers, no labels, no markdown.\n` +
      `6. Language: ${langInstruction}\n\n` +
      `EXAMPLES:\n${exampleBlock}\n\n` +
      `OUTPUT JSON SCHEMA (strict):\n` +
      `{\n` +
      `  "eventChronicle": "<3-5 sentences, 3rd person objective, ${params.languageCode}, NO meta>",\n` +
      `  "choices": [ {"id":"1","text":"..."}, {"id":"2","text":"..."}, {"id":"3","text":"..."}, {"id":"4","text":"..."} ],\n` +
      `  "effects": { "emotionalChanges": {...}, "itemsGained": [...], "itemsLost": [...], "suggestChapterTransition": boolean },\n` +
      `  "isEnding": boolean,\n` +
      `  "endingType": "string | null"\n` +
      `}\n` +
      `Choices must be in ${params.languageCode}. Exactly 4 choices with non-empty text.\n` +
      (params.nextPlayerName
        ? `\n⚠️ NEXT-TURN CHOICES RULE:\n` +
          `The "choices" array is for ${params.nextPlayerName} (the player who will act NEXT).\n` +
          `Each choice MUST describe an action ${params.nextPlayerName} performs — e.g. what ${params.nextPlayerName}\n` +
          `says, does, or decides. NEVER propose choices about what happens to ${params.nextPlayerName}\n` +
          `or what another character does to ${params.nextPlayerName}.\n` +
          `✅ Example (if next = ${params.nextPlayerName}): "${params.nextPlayerName} smiles and accepts"\n` +
          `❌ Bad: "Notice ${params.nextPlayerName}'s outfit" (that's an action ABOUT ${params.nextPlayerName}, not BY them)\n`
        : '');

    const userMessage =
      `ACTIVE PLAYER (who just chose): ${params.activePlayerName}\n` +
      `CHOICE TEXT: "${params.choiceText}"\n` +
      (params.nextPlayerName
        ? `NEXT-TURN PLAYER: ${params.nextPlayerName} (choices must be ${params.nextPlayerName}'s actions)\n`
        : '') +
      `\nWrite the eventChronicle describing the consequence of this choice.\n` +
      `Then propose exactly 4 "choices" for the NEXT turn` +
      (params.nextPlayerName ? ` — actions ${params.nextPlayerName} will perform.` : '.') +
      `\n\nREMINDERS (repeat of system rules):\n` +
      `- eventChronicle is 3rd person objective only.\n` +
      `- Use ONLY the names ${params.hostName} and ${params.guestName}. No "ben/sen/I/you".\n` +
      `- No "Özet:" / "Summary:" / perspective commentary. Pure narrative.\n` +
      `- 3-5 sentences.\n` +
      (params.nextPlayerName
        ? `- Choices are for ${params.nextPlayerName} — write them in 3rd person imperative ` +
          `("${params.nextPlayerName} offers...", "${params.nextPlayerName} yaklaşır ve...") or ` +
          `as direct action verbs describing ${params.nextPlayerName}'s intent.\n`
        : '') +
      (params.pacingHint ? `- Pacing hint: ${params.pacingHint}\n` : '') +
      (params.isLastChapter ? `- This is the LAST chapter; pace toward an ending.\n` : '');

    for (let attempt = 0; attempt < 3; attempt++) {
      const maxTokens = 1400 + attempt * 600;
      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.7,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`EventOrchestrator ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('Empty orchestrator response');

        const parsed = JSON.parse(content);
        if (!parsed.eventChronicle || typeof parsed.eventChronicle !== 'string') {
          throw new Error('Missing eventChronicle field');
        }
        if (!Array.isArray(parsed.choices) || parsed.choices.length === 0) {
          throw new Error('Missing/empty choices array');
        }

        // POV leak + meta-content validation — chronicle MUST be 3rd person objective.
        // Regex hafif: sadece ayrık pronoun'lar (isim/ek değil). Yanlış pozitif olmasın.
        const chronicle = parsed.eventChronicle as string;
        const trPronouns =
          /\b(ben|bana|benim|beni|benimle|bende|sen|sana|senin|seni|seninle|sende)\b/i.test(
            chronicle,
          );
        // Turkish 2nd person fiil ekleri — ayrık kelime sonunda "-din/-dun/-dün"
        // (en az 4 harfli fiil köklerinden sonra, "dün" günlük kelimesini yakalamamak için)
        const tr2ndVerbEnd =
          /\b[a-zçğıöşü]{3,}(?:din|dun|dün|tin|tun|tün|dın|tın|yorsun|acaksın|eceksin|mişsin|mışsın|muşsun|müşsün)\b/i.test(
            chronicle,
          );
        const en1stOr2nd = /\b(I|me|my|mine|myself|you|your|yours|yourself)\b/.test(
          chronicle.replace(/'/g, ''),
        );
        const metaMarkers =
          /(^|\n)\s*(özet\s*[:\-]|summary\s*[:\-]|not\s*[:\-]|note\s*[:\-]|from .+? perspective|.+? bakış açısından|açıklama\s*[:\-])/i.test(
            chronicle,
          );
        const hasPovLeak =
          (langKey === 'tr' && (trPronouns || tr2ndVerbEnd)) ||
          (langKey === 'en' && en1stOr2nd) ||
          metaMarkers;
        this.logger.log(
          `[orchestrator-dbg] langKey=${langKey} chronicle_head="${chronicle.slice(0, 80).replace(/\n/g, ' ')}" tr_pron=${trPronouns} tr_verb=${tr2ndVerbEnd}`,
        );
        if (hasPovLeak) {
          this.logger.warn(
            `[orchestrator] POV/meta leak (tr_pron=${trPronouns}, tr_verb=${tr2ndVerbEnd}, en=${en1stOr2nd}, meta=${metaMarkers}), retry ${attempt + 1}`,
          );
          throw new Error('Chronicle contains 1st/2nd person or meta commentary');
        }

        // Normalize effects.suggestChapterTransition → root (multiplayer.service bekliyor)
        const suggestTransition =
          parsed.suggestChapterTransition ??
          parsed.effects?.suggestChapterTransition ??
          false;

        this.logger.log(
          `[orchestrator] success attempt=${attempt + 1} chronicle_len=${parsed.eventChronicle.length} choices=${parsed.choices.length}`,
        );

        return {
          currentScene: parsed.eventChronicle,
          choices: parsed.choices,
          effects: {
            ...(parsed.effects || {}),
            suggestChapterTransition: suggestTransition,
          },
          isEnding: !!parsed.isEnding,
          endingType: parsed.endingType || undefined,
        } as GrokResponse;
      } catch (err) {
        this.logger.warn(
          `[orchestrator] attempt ${attempt + 1}/3 failed: ${(err as Error).message}`,
        );
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw new Error('EventOrchestrator failed after 3 attempts');
  }

  /**
   * 3-Call Pipeline — Call 2/3: POV Rewriter.
   * Event Orchestrator'ın ürettiği tarafsız chronicle'ı, istenen karakterin
   * 1. şahıs perspektifine yeniden yazar. Call 2 ve Call 3 paralel (Promise.allSettled)
   * çağrılır — böylece attention entanglement problemi mimari olarak aşılır.
   *
   * Eski delta retry API'si ile geriye uyumlu: existingScene + existingPovName + targetPovName
   * parametreleriyle de çalışır.
   */
  async generatePovPerspective(params: {
    eventChronicle?: string;       // Yeni pipeline (tercih edilen)
    povName?: string;               // Yeni pipeline: yazılacak POV
    otherName?: string;             // Yeni pipeline: 3. şahıs kalan isim
    // Legacy delta retry API
    existingScene?: string;
    existingPovName?: string;
    targetPovName?: string;
    languageCode?: string;
  }): Promise<string> {
    // Parametre normalizasyonu — yeni API mi legacy mi?
    const sourceScene = params.eventChronicle || params.existingScene || '';
    const targetPov = params.povName || params.targetPovName || '';
    const otherName = params.otherName ||
      (params.existingPovName && params.existingPovName !== targetPov
        ? params.existingPovName
        : '');
    const sourceLabel = params.eventChronicle
      ? 'neutral event chronicle'
      : `scene from ${params.existingPovName || 'another POV'}`;

    if (!sourceScene || !targetPov) {
      this.logger.warn(
        `[pov-rewriter] missing params — sourceScene=${!!sourceScene} targetPov=${targetPov}`,
      );
      return '';
    }

    const langKey = (params.languageCode || 'en').toLowerCase().split(/[-_]/)[0];
    const langInstruction = this.buildSummaryLanguageInstruction(params.languageCode);

    // ======================================================================
    // PHASE 1 — ANONYMIZATION (dominant entity bias elimination)
    // ======================================================================
    // targetPov → __YOU__ / otherName → __OTHER__
    // LLM artık "hangi karakter chronicle'da baskın" göremiyor; sadece
    // placeholder'ları görüyor. Attention positional bias'ı da kırılıyor.
    const YOU_TOKEN = '__YOU__';
    const OTHER_TOKEN = '__OTHER__';

    let anonymized = sourceScene;
    // Uzun isimler önce replace edilmeli (overlap'i engellemek için)
    const replacements: Array<[string, string]> = [];
    if (targetPov) replacements.push([targetPov, YOU_TOKEN]);
    if (otherName && otherName !== targetPov) replacements.push([otherName, OTHER_TOKEN]);
    // İsimleri uzunluğa göre sırala (uzun önce)
    replacements.sort(([a], [b]) => b.length - a.length);
    for (const [name, token] of replacements) {
      anonymized = anonymized.replace(
        new RegExp(`\\b${this.escapeRegex(name)}\\b`, 'gi'),
        token,
      );
      // "Esra'nın", "Erman'ın" gibi apostroflu iyelik eki varyantı
      anonymized = anonymized.replace(
        new RegExp(`\\b${this.escapeRegex(name)}['']([a-zçğıöşü]+)`, 'gi'),
        `${token}'$1`,
      );
    }

    // ======================================================================
    // PHASE 2 — LLM CALL (reasoning model, JSON I/O, system/user split)
    // ======================================================================
    // Prompt placeholder-based — karakter ismini görmez. "YOU = okuyucu" kuralı
    // jenerik ve hiçbir karaktere özel değil.
    const systemContent =
      `You are a narrative POV rewriter. Your input is a 3rd-person neutral event ` +
      `chronicle containing two tokens:\n` +
      `  - ${YOU_TOKEN} = the reader (the character whose POV you must adopt)\n` +
      `  - ${OTHER_TOKEN} = the other character (must stay in 3rd person)\n\n` +
      `Your task: rewrite the chronicle in 2nd-person narrative. Every reference to ` +
      `${YOU_TOKEN} becomes the 2nd-person pronoun ("you" in English, "sen/sana/senin/seni" ` +
      `and corresponding verb conjugation in Turkish). Every reference to ${OTHER_TOKEN} ` +
      `stays in 3rd person (leave the ${OTHER_TOKEN} token as-is; it will be replaced after ` +
      `your output).\n\n` +
      `Rules:\n` +
      `- Keep ALL facts, decisions, dialogue identical.\n` +
      `- Add subtle sensory/emotional perception from ${YOU_TOKEN}'s body.\n` +
      `- 3-5 sentences, plain prose.\n` +
      `- Do NOT invent a name for ${YOU_TOKEN}. Do NOT write ${YOU_TOKEN} literally in output — ` +
      `replace every occurrence with 2nd-person.\n` +
      `- Keep ${OTHER_TOKEN} exactly as ${OTHER_TOKEN} (the token) in your output.\n` +
      `- ${langInstruction}\n\n` +
      `Output JSON strictly: {"rewritten": "..."}`;

    const userContent = JSON.stringify({
      chronicle_anonymized: anonymized,
      you_token: YOU_TOKEN,
      other_token: OTHER_TOKEN,
      output_language: langKey,
      instruction:
        `Rewrite the chronicle so every ${YOU_TOKEN} becomes 2nd-person. ` +
        `Keep ${OTHER_TOKEN} literal in your output.`,
    });

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.reasoningModel,
            messages: [
              { role: 'system', content: systemContent },
              { role: 'user', content: userContent },
            ],
            // Per-call entropy decorrelation — uzman 2 önerisi.
            // Paralel iki call'un identical distribution'a düşmesini engeller.
            temperature: 0.6 + attempt * 0.15,
            max_tokens: 1200,
            response_format: { type: 'json_object' },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.warn(
            `[pov-rewriter] HTTP ${response.status}: ${errorText.slice(0, 200)}`,
          );
          if (attempt < maxAttempts - 1) continue;
          return '';
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || '';
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          this.logger.warn(`[pov-rewriter] JSON parse fail attempt=${attempt + 1}`);
          continue;
        }

        let rewritten = typeof parsed.rewritten === 'string' ? parsed.rewritten.trim() : '';
        if (rewritten.length < 30) {
          this.logger.warn(
            `[pov-rewriter] output too short (${rewritten.length}) attempt=${attempt + 1}`,
          );
          continue;
        }

        // ==================================================================
        // PHASE 3 — DEANONYMIZATION
        // ==================================================================
        // OTHER_TOKEN → otherName (gerçek isim geri konur).
        // YOU_TOKEN hâlâ metinde varsa POV fail (model placeholder'ı 2nd person'a
        // çevirmedi) → retry.
        if (rewritten.includes(YOU_TOKEN)) {
          this.logger.warn(
            `[pov-rewriter] YOU_TOKEN still present in output (POV not applied), attempt=${attempt + 1}`,
          );
          continue;
        }

        if (otherName) {
          rewritten = rewritten.replace(
            new RegExp(this.escapeRegex(OTHER_TOKEN), 'g'),
            otherName,
          );
        } else {
          // otherName yoksa token'ı temizle
          rewritten = rewritten.replace(new RegExp(this.escapeRegex(OTHER_TOKEN), 'g'), '');
        }

        // ==================================================================
        // PHASE 4 — VALIDATION (targetPov adının çıktıda geçmemesi lazım —
        // anonymize'den sonra oraya koyacak başka bir yol yok)
        // ==================================================================
        const targetNameInOutput = new RegExp(
          `\\b${this.escapeRegex(targetPov)}\\b`,
          'i',
        ).test(rewritten);
        if (targetNameInOutput) {
          this.logger.warn(
            `[pov-rewriter] target name "${targetPov}" leaked into output (model invented it), attempt=${attempt + 1}`,
          );
          continue;
        }

        // Source ile normalize edildiğinde aynı değilse retry.
        const norm = (s: string) =>
          s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?;:'"()\-—]+/g, '').trim();
        if (norm(rewritten) === norm(sourceScene)) {
          this.logger.warn(`[pov-rewriter] output identical to source, attempt=${attempt + 1}`);
          continue;
        }

        this.logger.log(
          `[pov-rewriter] OK target=${targetPov} attempt=${attempt + 1} len=${rewritten.length}`,
        );
        return rewritten;
      } catch (err) {
        this.logger.warn(
          `[pov-rewriter] error attempt=${attempt + 1}: ${(err as Error).message}`,
        );
        if (attempt < maxAttempts - 1) continue;
      }
    }
    return '';
  }

  /**
   * Özet prompt'larında AI'a hangi dilde yazılacağını söyleyen yardımcı.
   * Default 'en'. Hikayenin dili (session.languageCode veya params.languageCode)
   * ne ise o dilde özet üretilir.
   */
  private buildSummaryLanguageInstruction(languageCode?: string): string {
    const lang = (languageCode || 'en').trim().toLowerCase().split(/[-_]/)[0];
    const instructions: Record<string, string> = {
      en: 'Write the summary in English.',
      tr: 'Özeti Türkçe yaz.',
      ar: 'اكتب الملخص باللغة العربية.',
      de: 'Schreibe die Zusammenfassung auf Deutsch.',
      es: 'Escribe el resumen en español.',
      fr: 'Écris le résumé en français.',
      it: 'Scrivi il riassunto in italiano.',
      ja: '要約を日本語で書いてください。',
      ko: '요약을 한국어로 작성하세요.',
      pt: 'Escreva o resumo em português.',
      ru: 'Напишите резюме на русском языке.',
      zh: '用中文撰写摘要。',
    };
    return instructions[lang] || instructions.en;
  }
}
