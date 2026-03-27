/**
 * POST /api/cabinet/task-templates/generate
 * AI generates title + content for a task template from an etalon example.
 * Input: { etalon_content, procedure_name, procedure_description }
 * Output: { title, content }
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { hasRole, ROLE_GROUPS } from '@/lib/shared/auth/role-groups';
import { generateAIText } from '@/lib/shared/ai/client';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

const SYSTEM_PROMPT = `Ти — асистент з інформаційної безпеки. Створюєш шаблони задач на основі еталонних описів виконаних робіт.

ГОЛОВНЕ ПРАВИЛО: еталон — це ГОЛОВНИЙ вхід. Шаблон ОБОВ'ЯЗКОВО має описувати ТУ САМУ роботу, що в еталоні. Якщо еталон про аналіз журналів — шаблон про аналіз журналів. Якщо еталон про аудит — шаблон про аудит. НІКОЛИ не міняй тему.

Повертаєш JSON:
1. "title" — коротка назва задачі (5-10 слів). Має точно відображати суть роботи з еталону.
2. "content" — опис (2-4 речення): що саме треба зробити. Для співробітника (розуміння задачі) і для AI (генерація звітів).

Правила знеособлення:
- Видали конкретні дати, роки, місяці, квартали
- Видали назви компаній, проектів, ІС
- Видали прізвища
- Заміни конкретику узагальненням: "за звітний період", "в інформаційних системах" тощо
- НЕ ЗМІНЮЙ тему та суть роботи при знеособленні

Мова: українська. Формат: тільки JSON, без markdown.

Приклад:
Еталон: "У I кварталі 2026 року проведено аналіз журналів подій SIEM для виявлення аномалій в мережі ПАТ Приклад"
Результат: {"title":"Аналіз журналів подій SIEM","content":"Провести аналіз журналів подій інформаційної безпеки з використанням SIEM-системи. Виявити аномальну активність та потенційні інциденти ІБ, забезпечити їх документування та ескалацію відповідно до процедури реагування."}`;

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(`tpl-gen:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  try {
    // Role check
    const db = getDb();
    const { data: profile } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
    const role = (profile as { role: string } | null)?.role;
    if (!role || !hasRole(role, ROLE_GROUPS.REF_EDITORS)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { etalon_content, procedure_name, procedure_description } = body as {
      etalon_content?: string;
      procedure_name?: string;
      procedure_description?: string;
    };

    if (!etalon_content?.trim()) {
      return NextResponse.json({ error: 'etalon_content required' }, { status: 400 });
    }

    const userPrompt = [
      `=== ЕТАЛОН (головний вхід — шаблон має бути про ЦЮ роботу) ===`,
      etalon_content.trim(),
      '',
      `=== Контекст процедури (довідково) ===`,
      `Назва: ${procedure_name || 'Без назви'}`,
      procedure_description ? `Опис: ${procedure_description}` : '',
    ].filter(Boolean).join('\n');

    const raw = await generateAIText({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 500,
      temperature: 0.15,
      timeoutMs: 15_000,
      providerOverride: 'anthropic',
      anthropicModel: 'claude-sonnet-4-20250514',
    });

    // Parse JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('[TaskTemplate Generate] No JSON in AI response:', raw);
      return NextResponse.json({ error: 'AI response parsing failed' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { title?: string; content?: string };
    if (!parsed.title || !parsed.content) {
      return NextResponse.json({ error: 'AI returned incomplete data' }, { status: 500 });
    }

    return NextResponse.json({ title: parsed.title, content: parsed.content });
  } catch (err) {
    logger.error('[TaskTemplate Generate] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
