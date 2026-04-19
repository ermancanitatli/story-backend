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
  }): Promise<GrokResponse> {
    const { systemPrompt, userMessage, maxRetries = 3 } = params;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const maxTokens = 4000 + attempt * 2000;

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
        const hasBilingual = parsed.scenes && typeof parsed.scenes === 'object'
          && (parsed.localizedChoices && typeof parsed.localizedChoices === 'object');
        if (!hasSingleLang && !hasBilingual) {
          throw new Error('Invalid Grok response format: missing currentScene/choices or scenes/localizedChoices');
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
  ): Promise<string> {
    if (!newScenes || newScenes.length === 0) return '';

    const scenesText = newScenes
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n\n');

    const langInstruction = this.buildSummaryLanguageInstruction(languageCode);

    const userContent = existingSummary
      ? `Previous rolling summary:\n${existingSummary}\n\nNew scenes to merge:\n${scenesText}\n\n` +
        `Update the summary incorporating the new scenes. Keep: character actions, decisions, promises made, key emotional shifts. Skip: atmospheric descriptions, weather, scenery. Output 2-4 sentences, past tense, factual tone, plain text only (no JSON, no bullets). ${langInstruction}`
      : `Scenes:\n${scenesText}\n\nCompress into 2-4 sentences. Keep: character actions, decisions, promises, emotional shifts. Past tense, factual. Plain text only. ${langInstruction}`;

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
                `You are a story editor. Produce concise factual summaries. Do not invent facts. Do not use dramatic prose. Plain narrative past tense only. ${langInstruction}`,
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
