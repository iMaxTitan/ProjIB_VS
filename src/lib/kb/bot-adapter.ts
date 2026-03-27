/**
 * KB bot adapter — describes how the Knowledge Base integrates with the bot.
 * All search logic lives in lib/kb/search.ts.
 * This file only defines the BotTool interface for AI tool-calling.
 */

import type { BotTool, ToolContext, FormattedResult } from '@/lib/bot/core/types';
import { searchAndAnswer } from '@/lib/kb';

export const kbSearchTool: BotTool = {
  name: 'kb_search',
  label: 'База знань',
  description:
    'Пошук у корпоративній базі знань. Використовуй для БУДЬ-ЯКИХ питань про роботу: ' +
    'правила, процедури, ПЗ, обладнання, безпеку, кадри, інструкції, як зробити щось на роботі. ' +
    'Якщо не впевнений — все одно спробуй. Повертає готову відповідь.',
  supportedScopes: ['own', 'department', 'all'],
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Питання або тема для пошуку в нормативній документації',
      },
      category: {
        type: 'string',
        description: 'Категорія документів: ib (ІБ), hr, it, legal — якщо відомо. Якщо невідомо — не вказуй.',
      },
    },
    required: ['query'],
  },

  async execute(args, ctx: ToolContext): Promise<FormattedResult> {
    const result = await searchAndAnswer(args.query as string, {
      userId: ctx.userId,
      role: ctx.role,
      source: ctx.source,
      db: ctx.db,
      category: args.category as string | undefined,
    });
    return { __type: 'formatted', text: result.text, parseMode: result.parseMode };
  },
};
