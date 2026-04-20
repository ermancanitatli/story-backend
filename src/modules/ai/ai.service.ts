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

  constructor(private config: ConfigService) {
    this.apiUrl = this.config.get('GROK_API_URL', 'https://api.x.ai/v1/chat/completions');
    this.apiKey = this.config.get('GROK_API_KEY', '');
    this.model = this.config.get('GROK_MODEL', 'grok-4-fast-non-reasoning');
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
      `Choices must be in ${params.languageCode}. Exactly 4 choices with non-empty text.`;

    const userMessage =
      `ACTIVE PLAYER (who just chose): ${params.activePlayerName}\n` +
      `CHOICE TEXT: "${params.choiceText}"\n\n` +
      `Write the eventChronicle describing the consequence of this choice.\n` +
      `Then propose exactly 4 "choices" for the NEXT turn.\n\n` +
      `REMINDERS (repeat of system rules):\n` +
      `- eventChronicle is 3rd person objective only.\n` +
      `- Use ONLY the names ${params.hostName} and ${params.guestName}. No "ben/sen/I/you".\n` +
      `- No "Özet:" / "Summary:" / perspective commentary. Pure narrative.\n` +
      `- 3-5 sentences.\n` +
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

        // POV leak + meta-content validation — chronicle MUST be 3rd person objective
        const chronicle = parsed.eventChronicle as string;
        const chronicleLower = chronicle.toLowerCase();
        // Turkish 1st person endings / pronouns
        const tr1stOr2nd =
          /\b(ben|bana|benim|beni|benimle|sen|sana|senin|seni|seninle|sana ait)\b/i.test(chronicle) ||
          /\b\w+(?:dım|dim|dum|düm|tım|tim|tum|tüm|yorum|yorsun|muşum|mışım|acağım|eceğim|dın|din|dun|dün|tın|tin|tun|tün|yorsun)\b/i.test(chronicle);
        // English I/me/my/you
        const en1stOr2nd = /\b(i|me|my|mine|myself|you|your|yours|yourself)\b/i.test(
          chronicle.replace(/'/g, ''),
        );
        // Meta content markers
        const metaMarkers =
          /(^|\n)\s*(özet|summary|not:|note:|from .*? perspective|.*? bakış açısından|açıklama:)/i.test(
            chronicle,
          );
        const hasPovLeak =
          (langKey === 'tr' && tr1stOr2nd) ||
          (langKey === 'en' && en1stOr2nd) ||
          metaMarkers;
        if (hasPovLeak) {
          this.logger.warn(
            `[orchestrator] POV/meta leak detected (tr1st=${tr1stOr2nd}, en1st=${en1stOr2nd}, meta=${metaMarkers}), retrying`,
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
    const langInstruction = this.buildSummaryLanguageInstruction(params.languageCode);
    const langKey = (params.languageCode || 'en').toLowerCase().split(/[-_]/)[0];

    // Dil-özel pronoun kuralı — interactive story formatı, "sen" = okuyucu = targetPov
    const pronounRules: Record<string, string> = {
      tr:
        `- Bu interaktif hikaye 2. şahıs anlatımı (okuyucu perspektifi) kullanır.\n` +
        `- "sen", "sana", "senin", "seni" → ${targetPov} (okuyucu, yani sahneyi yaşayan kişi).\n` +
        (otherName ? `- ${otherName} → 3. şahıs, ismi veya "o/onu/ona" ile.\n` : '') +
        `- "ben", "bana", "benim" ASLA KULLANMA.\n` +
        `- Fiil çekimi: 2. tekil şahıs ("-din, -dun, -yorsun, -acaksın").`,
      en:
        `- This is 2nd-person narrative (reader = ${targetPov}).\n` +
        `- "you", "your" → ${targetPov} (the reader living the scene).\n` +
        (otherName ? `- ${otherName} → 3rd person, by name or "he/she/they".\n` : '') +
        `- NEVER use "I", "me", "my".`,
    };
    const pronounBlock = pronounRules[langKey] || pronounRules.en;

    // Dil-özel iyi/kötü örnek
    const examples: Record<string, string> = {
      tr:
        `ÖRNEK (${targetPov} POV'u):\n` +
        `✅ "Matına doğru yürüdün${otherName ? `, ${otherName} seni izledi` : ''}. Yeni pozu denedin, dengeni korudun."\n` +
        `❌ "${targetPov} matına yürüdü" (3. şahıs — sen olmalı)\n` +
        `❌ "Matıma doğru yürüdüm" (1. şahıs — sen olmalı)`,
      en:
        `EXAMPLE (${targetPov} POV):\n` +
        `✅ "You walked to your mat${otherName ? `; ${otherName} watched you` : ''}. You tried the new pose, kept your balance."\n` +
        `❌ "${targetPov} walked to the mat" (3rd person — use "you")\n` +
        `❌ "I walked to the mat" (1st person — use "you")`,
    };
    const exampleBlock = examples[langKey] || examples.en;

    const userContent =
      `SOURCE (${sourceLabel}, 3rd-person neutral):\n"""\n${sourceScene}\n"""\n\n` +
      `TASK: Rewrite the SAME EVENT from ${targetPov}'s perspective using 2nd-person ("sen"/"you") narrative.\n\n` +
      `PRONOUN RULES:\n${pronounBlock}\n\n` +
      `${exampleBlock}\n\n` +
      `ADDITIONAL:\n` +
      `- Same facts, decisions, dialogue. Different INTERNAL experience.\n` +
      `- Add ${targetPov}'s sensory / emotional perception.\n` +
      `- 3-5 sentences, plain prose. No JSON, no labels, no "Özet:", no quotes around output.\n` +
      `- ${langInstruction}`;

    // Retry: empty / too-short output → 1 retry
    for (let attempt = 0; attempt < 2; attempt++) {
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
                  `You are a POV rewriter for an interactive story. The source is a 3rd-person ` +
                  `neutral event chronicle. Rewrite it in 2nd-person narrative ("sen"/"you") from ` +
                  `the specified character's perspective. The reader IS that character, so "sen"/"you" ` +
                  `refers to them. Keep facts identical; change pronouns and add internal perception. ` +
                  `Output plain prose only. ${langInstruction}`,
              },
              { role: 'user', content: userContent },
            ],
            temperature: 0.55,
            max_tokens: 800,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.warn(
            `generatePovPerspective failed (${response.status}): ${errorText}`,
          );
          if (attempt === 0) continue;
          return '';
        }

        const data = await response.json();
        const text = (data.choices?.[0]?.message?.content?.trim() || '') as string;
        if (text.length < 30 && attempt === 0) {
          this.logger.warn(`[pov-rewriter] too-short output (${text.length}), retrying`);
          continue;
        }
        // Perspective validation — target POV 2nd person, karakter kendi adı 3. şahıs olarak geçmemeli
        // ve kaynak metinle byte-eş olmamalı
        if (attempt === 0 && text && sourceScene) {
          const trimmedSource = sourceScene.trim();
          const isIdenticalToSource = text === trimmedSource;
          // Normalize: küçük harf + whitespace squash
          const norm = (s: string) =>
            s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?;:'"()-]+/g, '').trim();
          const isTooSimilar = norm(text) === norm(trimmedSource);
          // Türkçe: hedef POV adı chronicle'daki gibi "X yaptı" formatında kalmışsa POV fail
          // Basit kontrol: "sen/you" hiç yok + targetPov adı 3 kez geçiyor → POV uygulanmamış
          const hasYouPronoun =
            langKey === 'tr'
              ? /\b(sen|sana|senin|seni|seninle)\b|\w+(?:din|dun|dün|tin|tun|tün|yorsun|acaksın|eceksin)\b/i.test(text)
              : /\b(you|your|yours|yourself)\b/i.test(text);
          const targetNameMentions = (text.match(new RegExp(`\\b${targetPov}\\b`, 'gi')) || [])
            .length;
          const povNotApplied = !hasYouPronoun && targetNameMentions >= 2;
          if (isIdenticalToSource || isTooSimilar || povNotApplied) {
            this.logger.warn(
              `[pov-rewriter] POV not applied (identical=${isIdenticalToSource}, similar=${isTooSimilar}, no-you=${povNotApplied}), retrying with stricter prompt`,
            );
            continue;
          }
        }
        return text;
      } catch (err) {
        this.logger.warn(
          `generatePovPerspective error: ${(err as Error).message}`,
        );
        if (attempt === 0) continue;
        return '';
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
