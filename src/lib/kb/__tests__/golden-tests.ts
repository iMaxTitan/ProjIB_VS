/**
 * Golden test cases for KB RAG pipeline quality evaluation.
 * Each test defines a query and expected outcomes.
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
}

export const GOLDEN_TESTS: GoldenTest[] = [
  {
    name: 'Категорийный: 4G модем → периферійне обладнання',
    query: 'як підключити 4G модем до робочого місця',
    category: 'ib',
    expectedSubstrings: ['периферійн'],
    expectAnswer: true,
    forbiddenSubstrings: ['зверніться до', 'рекомендуємо звернутися'],
  },
  {
    name: 'Категорийный: флешка → знімні носії',
    query: 'чи можна підключити флешку до робочого комп\'ютера',
    category: 'ib',
    expectedSubstrings: ['знімн'],
    expectAnswer: true,
  },
  {
    name: 'Прямой: установка ПЗ',
    query: 'як встановити програму на робочий комп\'ютер',
    category: 'ib',
    expectedSubstrings: ['встанов', 'програмн'],
    expectAnswer: true,
  },
  {
    name: 'Прямой: Teams в базовом наборе',
    query: 'як встановити Teams на робочу станцію',
    expectedSubstrings: ['Teams'],
    expectAnswer: true,
  },
  {
    name: 'Прямой: навчання з ІБ',
    query: 'що буде якщо я не пройду щорічне навчання з інформаційної безпеки',
    category: 'ib',
    expectedSubstrings: ['навчан'],
    expectAnswer: true,
    forbiddenSubstrings: ['зверніться до'],
  },
  {
    name: 'Прямой: пароль',
    query: 'які вимоги до пароля',
    category: 'ib',
    expectedSubstrings: ['парол'],
    expectAnswer: true,
  },
  {
    name: 'Прямой: віддалений доступ',
    query: 'як отримати віддалений доступ до робочого місця',
    category: 'ib',
    expectedSubstrings: ['віддален'],
    expectAnswer: true,
  },
  {
    name: 'Прямой: інцидент ІБ',
    query: 'що робити при виявленні інциденту інформаційної безпеки',
    category: 'ib',
    expectedSubstrings: ['інцидент'],
    expectAnswer: true,
  },
  {
    name: 'Несуществующая тема → корректный отказ',
    query: 'як замовити піцу в офіс',
    expectedSubstrings: ['немає інформації'],
    expectAnswer: false,
  },
  {
    name: 'Антигаллюцинация: нет советов звернутися',
    query: 'чи можна використовувати особисті пристрої для роботи',
    category: 'ib',
    expectedSubstrings: [],
    expectAnswer: true,
    forbiddenSubstrings: ['зверніться до', 'рекомендуємо звернутися', 'радимо звернутися'],
  },
];
