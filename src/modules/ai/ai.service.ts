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
  };
  isEnding?: boolean;
  endingType?: string;
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
}
