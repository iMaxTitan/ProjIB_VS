/**
 * Golden test cases for KB RAG pipeline quality evaluation.
 * Each test defines a query and expected outcomes.
 *
 * Categories covered:
 * - legal: мобілізація, бронювання, КЗпП, споживачі, персональні дані
 * - ib: політики ІБ, доступ, паролі, інциденти, шифрування
 * - hr: кадрова політика
 * - it: управління проєктами, ЦК
 * - cross: запити що торкаються кількох категорій
 * - refusal: запити поза БЗ → коректна відмова
 */

export interface GoldenTest {
  /** Human-readable test name */
  name: string;
  /** User query (as entered in bot) */
  query: string;
  /** Category hint (optional) */
  category?: string;
  /** Substrings that MUST appear in the answer (case-insensitive) */
  expectedSubstrings: string[];
  /** If true, the answer must NOT contain the AI refusal marker */
  expectAnswer: boolean;
  /** Substrings that must NOT appear (hallucination check) */
  forbiddenSubstrings?: string[];
  /** Difficulty: easy = direct fact, medium = reasoning, hard = cross-doc */
  difficulty?: 'easy' | 'medium' | 'hard';
}

export const GOLDEN_TESTS: GoldenTest[] = [
  // ══════════════════════════════════════════════════════════════════════
  // LEGAL — Мобілізація та бронювання
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Legal: строк бронювання',
    query: 'на який строк надається бронювання працівників',
    expectedSubstrings: ['місяц'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'Legal: хто може бронювати',
    query: 'які підприємства мають право бронювати працівників',
    expectedSubstrings: ['критично важлив'],
    expectAnswer: true,
    difficulty: 'medium',
  },
  {
    name: 'Legal: військовий облік',
    query: 'хто відповідає за ведення військового обліку на підприємстві',
    expectedSubstrings: ['облік'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'Legal: виїзд за кордон під час мобілізації',
    query: 'чи може військовозобов\'язаний виїхати за кордон',
    expectedSubstrings: ['кордон'],
    expectAnswer: true,
    difficulty: 'medium',
  },
  {
    name: 'Legal: ліміт бронювання 50%',
    query: 'скільки відсотків працівників можна забронювати',
    expectedSubstrings: ['50'],
    expectAnswer: true,
    difficulty: 'easy',
  },

  // ══════════════════════════════════════════════════════════════════════
  // LEGAL — КЗпП (Кодекс законів про працю)
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Legal: випробувальний термін',
    query: 'який максимальний строк випробування при прийнятті на роботу',
    expectedSubstrings: ['місяц'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'Legal: відпустка',
    query: 'яка тривалість щорічної основної відпустки',
    expectedSubstrings: ['календарн'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'Legal: звільнення за прогул',
    query: 'чи можна звільнити працівника за прогул',
    expectedSubstrings: ['звільн'],
    expectAnswer: true,
    difficulty: 'medium',
  },
  {
    name: 'Legal: робочий час',
    query: 'яка нормальна тривалість робочого часу',
    expectedSubstrings: ['годин'],
    expectAnswer: true,
    difficulty: 'easy',
  },

  // ══════════════════════════════════════════════════════════════════════
  // LEGAL — Захист споживачів
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Legal: повернення товару',
    query: 'протягом якого строку покупець може повернути товар належної якості',
    expectedSubstrings: ['14', 'дн'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'Legal: гарантійний ремонт',
    query: 'який строк гарантійного ремонту товару',
    expectedSubstrings: ['дн'],
    expectAnswer: true,
    difficulty: 'easy',
  },

  // ══════════════════════════════════════════════════════════════════════
  // LEGAL — Персональні дані
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Legal: згода на обробку персональних даних',
    query: 'чи потрібна згода працівника на обробку персональних даних',
    expectedSubstrings: ['згод', 'персональн'],
    expectAnswer: true,
    difficulty: 'medium',
  },

  // ══════════════════════════════════════════════════════════════════════
  // LEGAL — Кібербезпека
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Legal: кібербезпека держави',
    query: 'хто координує забезпечення кібербезпеки в Україні',
    expectedSubstrings: ['кібербезпек'],
    expectAnswer: true,
    difficulty: 'medium',
  },

  // ══════════════════════════════════════════════════════════════════════
  // IB — Інформаційна безпека
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'IB: вимоги до пароля',
    query: 'які вимоги до пароля в компанії',
    category: 'ib',
    expectedSubstrings: ['парол'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'IB: знімні носії (флешка)',
    query: 'чи можна підключити флешку до робочого комп\'ютера',
    category: 'ib',
    expectedSubstrings: ['знімн'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'IB: встановлення ПЗ',
    query: 'як встановити програму на робочий комп\'ютер',
    category: 'ib',
    expectedSubstrings: ['встанов', 'програмн'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'IB: інцидент ІБ',
    query: 'що робити при виявленні інциденту інформаційної безпеки',
    category: 'ib',
    expectedSubstrings: ['інцидент'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'IB: віддалений доступ',
    query: 'як отримати віддалений доступ до робочого місця',
    category: 'ib',
    expectedSubstrings: ['віддален'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'IB: 4G модем → периферійне обладнання',
    query: 'як підключити 4G модем до робочого місця',
    category: 'ib',
    expectedSubstrings: ['периферійн'],
    expectAnswer: true,
    forbiddenSubstrings: ['зверніться до', 'рекомендуємо звернутися'],
    difficulty: 'medium',
  },
  {
    name: 'IB: щорічне навчання',
    query: 'що буде якщо я не пройду щорічне навчання з інформаційної безпеки',
    category: 'ib',
    expectedSubstrings: ['навчан'],
    expectAnswer: true,
    forbiddenSubstrings: ['зверніться до'],
    difficulty: 'easy',
  },
  {
    name: 'IB: мобільні пристрої',
    query: 'які вимоги до використання мобільних пристроїв для роботи',
    category: 'ib',
    expectedSubstrings: ['мобільн'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'IB: шифрування даних',
    query: 'які вимоги до криптографічного захисту інформації',
    category: 'ib',
    expectedSubstrings: ['криптограф'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'IB: резервне копіювання',
    query: 'як часто потрібно робити резервні копії',
    category: 'ib',
    expectedSubstrings: ['резервн'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'IB: фізична безпека серверної',
    query: 'які вимоги до фізичної безпеки серверних приміщень',
    category: 'ib',
    expectedSubstrings: ['серверн'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'IB: управління ризиками',
    query: 'як оцінюються ризики інформаційної безпеки',
    category: 'ib',
    expectedSubstrings: ['ризик'],
    expectAnswer: true,
    difficulty: 'medium',
  },
  {
    name: 'IB: комерційна таємниця',
    query: 'що відноситься до комерційної таємниці компанії',
    category: 'ib',
    expectedSubstrings: ['таємниц'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'IB: BYOD',
    query: 'чи можна використовувати особисті пристрої для роботи',
    category: 'ib',
    expectedSubstrings: [],
    expectAnswer: true,
    forbiddenSubstrings: ['зверніться до', 'рекомендуємо звернутися', 'радимо звернутися'],
    difficulty: 'medium',
  },
  {
    name: 'IB: Teams в базовому наборі',
    query: 'як встановити Teams на робочу станцію',
    expectedSubstrings: ['Teams'],
    expectAnswer: true,
    difficulty: 'easy',
  },

  // ══════════════════════════════════════════════════════════════════════
  // HR — Кадрова політика
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'HR: кадрова політика загальне',
    query: 'які основні принципи кадрової політики компанії',
    category: 'hr',
    expectedSubstrings: ['кадров'],
    expectAnswer: true,
    difficulty: 'easy',
  },
  {
    name: 'HR: навчання персоналу',
    query: 'як організовано навчання нових працівників',
    category: 'hr',
    expectedSubstrings: ['навчан'],
    expectAnswer: true,
    difficulty: 'medium',
  },

  // ══════════════════════════════════════════════════════════════════════
  // IT — Управління проєктами та ЦК
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'IT: управління проєктами',
    query: 'які етапи управління ІТ проєктами',
    category: 'it',
    expectedSubstrings: ['проєкт'],
    expectAnswer: true,
    difficulty: 'easy',
  },

  // ══════════════════════════════════════════════════════════════════════
  // CROSS — Міжкатегорійні запити
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Cross: права працівника мобілізованого',
    query: 'які трудові гарантії має працівник який був мобілізований',
    expectedSubstrings: ['мобіліз'],
    expectAnswer: true,
    difficulty: 'hard',
  },
  {
    name: 'Cross: захист даних працівників',
    query: 'як компанія захищає персональні дані працівників',
    expectedSubstrings: ['персональн'],
    expectAnswer: true,
    difficulty: 'hard',
  },

  // ══════════════════════════════════════════════════════════════════════
  // REFUSAL — Запити поза БЗ → коректна відмова
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Refusal: замовити піцу → відмова',
    query: 'як замовити піцу в офіс',
    expectedSubstrings: ['немає інформації'],
    expectAnswer: false,
    difficulty: 'easy',
  },
  {
    name: 'Refusal: погода → відмова',
    query: 'яка буде погода завтра',
    expectedSubstrings: ['немає інформації'],
    expectAnswer: false,
    difficulty: 'easy',
  },
  {
    name: 'Refusal: рецепт борщу → відмова',
    query: 'як приготувати борщ',
    expectedSubstrings: ['немає інформації'],
    expectAnswer: false,
    difficulty: 'easy',
  },
];
