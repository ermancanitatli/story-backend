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
    const systemPrompt =
      `${params.storyContext}\n\n` +
      `====================\n` +
      `MODE: NEUTRAL EVENT CHRONICLER (3-call pipeline, Step 1 of 3)\n` +
      `====================\n` +
      `You are a NEUTRAL CHRONICLER. Your ONLY job is to describe WHAT HAPPENED as a result of ` +
      `${params.activePlayerName}'s choice. The final first-person scenes for each player will be ` +
      `written by separate POV rewriters in subsequent calls — NOT by you.\n\n` +
      `HARD RULES:\n` +
      `- Write in 3rd PERSON OBJECTIVE NARRATOR voice.\n` +
      `- NEVER use "sen" / "you" / "I" / "ben".\n` +
      `- ALWAYS use character names: ${params.hostName}, ${params.guestName}.\n` +
      `- Describe external events, dialogue, and observable emotions — NOT internal thoughts.\n` +
      `- 3-5 sentences. Same factual content any POV rewriter could use.\n` +
      `- ${langInstruction}\n\n` +
      `OUTPUT JSON SCHEMA:\n` +
      `{\n` +
      `  "eventChronicle": "string (3-5 sentences, 3rd person objective, ${params.languageCode})",\n` +
      `  "choices": [ { "id": "1", "text": "..." }, { "id": "2", "text": "..." }, ... ],\n` +
      `  "effects": { "emotionalChanges": {...}, "itemsGained": [...], "itemsLost": [...], "suggestChapterTransition": boolean },\n` +
      `  "isEnding": boolean,\n` +
      `  "endingType": "string | null"\n` +
      `}\n\n` +
      `Choices must be written in the same language as eventChronicle (${params.languageCode}).`;

    const userMessage =
      `ACTIVE PLAYER: ${params.activePlayerName}\n` +
      `CHOICE MADE: "${params.choiceText}"\n\n` +
      `Describe the immediate consequence of this choice as a neutral chronicler. ` +
      `Then propose 3-4 choices for the NEXT turn.\n\n` +
      `REMINDERS:\n` +
      `- 3rd person objective, no "sen"/"you"/"I".\n` +
      `- Use names: ${params.hostName}, ${params.guestName}.\n` +
      `- Facts only; leave internal POV to the rewriters.\n` +
      (params.pacingHint ? `- Pacing: ${params.pacingHint}\n` : '') +
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

    const otherRule = otherName
      ? `- ${otherName} is 3rd person, addressed by name.\n`
      : `- All other characters remain 3rd person.\n`;

    const userContent =
      `Source (${sourceLabel}):\n"""\n${sourceScene}\n"""\n\n` +
      `Rewrite this SAME EVENT from ${targetPov}'s FIRST-PERSON perspective.\n` +
      `Rules:\n` +
      `- "sen" / "you" = ${targetPov}\n` +
      otherRule +
      `- Same facts, decisions, dialogue — different INTERNAL experience.\n` +
      `- Add ${targetPov}'s sensory / emotional perception.\n` +
      `- 3-5 sentences, plain text, no JSON, no quotes around output.\n` +
      `${langInstruction}`;

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
                  `You are a POV rewriter. Take a scene and rewrite it from the specified character's first-person perspective. ` +
                  `Keep all events factual, only change internal perception and pronouns. Output plain text only. ${langInstruction}`,
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
