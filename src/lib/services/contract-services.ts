/**
 * Маппинг процессов ИБ на услуги по договору
 * Формат актов: приложение к Акту приема-передачи услуг
 *
 * Файл определяет соответствие между процессами в базе данных
 * и официальными названиями услуг для формирования актов между предприятиями
 */

// Тип для услуги согласно договору
export interface ContractService {
  id: number;
  categoryId: number;      // ID категории (группы услуг)
  name: string;            // Официальное название услуги согласно договору
  keywords: string[];      // Ключевые слова для маппинга по имени процесса/задачи
  description?: string;    // Описание для AI-форматирования
}

// Категории услуг согласно договору
export interface ServiceCategory {
  id: number;
  name: string;
  description: string;
}

/**
 * Категории услуг согласно SOC-договору
 */
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: 1,
    name: "Забезпечення кібербезпеки ІКС",
    description: "Забезпечення кібербезпеки інформаційно-комунікаційних систем, програмних продуктів та інформації, що в них обробляється"
  },
  {
    id: 2,
    name: "Розроблення та впровадження заходів",
    description: "Розроблення та впровадження організаційних заходів, програмних та апаратно-програмних продуктів для запобігання кіберінцидентам"
  },
  {
    id: 3,
    name: "Аналіз кіберінцидентів",
    description: "Оброблення та аналіз даних про обставини кіберінциденту та його наслідки"
  },
  {
    id: 4,
    name: "Планування та проектування систем",
    description: "Планування та проектування інтегрованих комп'ютерних систем для захищеної обробки інформації"
  },
  {
    id: 5,
    name: "Консультації з кібербезпеки",
    description: "Надання консультацій з питань забезпечення кібербезпеки комунікаційних систем та програмного забезпечення"
  },
  {
    id: 6,
    name: "Експлуатація та обслуговування",
    description: "Надання послуг з експлуатації та технічного обслуговування комунікаційного обладнання для забезпечення кібербезпеки"
  },
  {
    id: 7,
    name: "Дослідження та розробки",
    description: "Проведення досліджень та здійснення експериментальних розробок у сфері забезпечення кібербезпеки"
  }
];

/**
 * Маппинг процессов БД на услуги договора
 * Процессы в БД:
 * - Управлінська та організаційна діяльність
 * - Управління правами доступу
 * - Захист даних
 * - Управління безпекою інформаційних систем
 * - Управління безпекою обчислювальних систем
 * - Управління безпекою мережі
 * - Моніторинг та реагування на події та інциденти ІБ
 * - Управління ризиками інформаційної безпеки
 * - Навчання та підвищення обізнаності у сфері ІБ
 * - Управління документацією СУІБ
 * - Безперервність інформаційної безпеки
 */
export const CONTRACT_SERVICES: ContractService[] = [
  // === Категория 1: Обеспечение кибербезопасности ИКС ===
  {
    id: 1,
    categoryId: 1,
    name: "Надання послуг з експлуатації та технічного обслуговування комунікаційного обладнання, програмного забезпечення, призначеного для забезпечення кібербезпеки комунікаційних та технологічних систем (мереж)",
    keywords: ["управління безпекою мережі", "мережі", "комунікаційне", "мережев"]
  },
  {
    id: 2,
    categoryId: 1,
    name: "Перевірка та аналіз поточного стану інформаційних систем (аналіз та технічна підтримка працюючих сервісів та програм, перевірка останніх версій програмного забезпечення та оновлень до нього)",
    keywords: ["управління безпекою інформаційних систем", "безпека ІС", "інформаційних систем"]
  },
  {
    id: 3,
    categoryId: 1,
    name: "Проведення комплексної перевірки та аналізу інформаційної безпеки",
    keywords: ["комплексна перевірка", "аналіз ІБ", "аналіз безпеки", "оцінка безпеки"]
  },
  {
    id: 4,
    categoryId: 1,
    name: "Аудит робочих станцій на відповідність стандартам інформаційної безпеки",
    keywords: ["управління безпекою обчислювальних систем", "обчислювальних систем", "робочі станції", "АРМ"]
  },
  {
    id: 5,
    categoryId: 1,
    name: "Перевірка серверів на відповідність стандартам інформаційної безпеки",
    keywords: ["сервери", "серверна", "перевірка серверів"]
  },
  {
    id: 6,
    categoryId: 1,
    name: "Надання консультацій щодо перевірки на відповідність стандартам ПІБ серверів",
    keywords: ["консультації", "стандарти"]
  },
  {
    id: 7,
    categoryId: 1,
    name: "Моніторинг подій в роботі антивірусного програмного забезпечення",
    keywords: ["антивірус", "антивірусне", "захист від вірусів"]
  },
  {
    id: 8,
    categoryId: 1,
    name: "Контроль резервного копіювання",
    keywords: ["резервне", "backup", "бекап", "безперервність інформаційної безпеки", "безперервність"]
  },
  {
    id: 9,
    categoryId: 1,
    name: "Централізоване управління і контроль захищеності інформаційних систем",
    keywords: ["централізоване", "контроль захищеності", "SIEM", "захищеності"]
  },
  {
    id: 10,
    categoryId: 1,
    name: "Узгодження надання доступу до ІС",
    keywords: ["управління правами доступу", "права доступу", "доступ", "узгодження"]
  },
  {
    id: 11,
    categoryId: 1,
    name: "Технічна підтримка сервісів",
    keywords: ["підтримка", "support", "супровід"]
  },

  // === Категория 2: Разработка и внедрение мер ===
  {
    id: 12,
    categoryId: 2,
    name: "Розробка та організація впровадження рекомендацій щодо підвищення стану ІБ",
    keywords: ["рекомендації", "впровадження", "підвищення ІБ"]
  },
  {
    id: 13,
    categoryId: 2,
    name: "Надання інформації з питань надання послуг з інформаційної безпеки",
    keywords: ["інформування", "інформаційна безпека"]
  },
  {
    id: 14,
    categoryId: 2,
    name: "Виявлення атак, підозрілої активності, спроб несанкціонованого доступу та оперативного реагування",
    keywords: ["моніторинг та реагування на події та інциденти", "реагування", "інциденти", "атаки", "виявлення"]
  },
  {
    id: 15,
    categoryId: 2,
    name: "Захист від несанкціонованого доступу до інформаційних активів Замовника, виключення неправомірного доступу, розмежування прав користувачів",
    keywords: ["захист даних", "захист від", "НСД", "розмежування"]
  },
  {
    id: 16,
    categoryId: 2,
    name: "Моніторинг подій інформаційної та кібербезпеки в мережі замовника",
    keywords: ["моніторинг", "події", "SOC", "подій"]
  },
  {
    id: 17,
    categoryId: 2,
    name: "Моніторинг подій інформаційної безпеки",
    keywords: ["моніторинг подій", "події безпеки", "security"]
  },
  {
    id: 18,
    categoryId: 2,
    name: "Моніторинг вразливостей інформаційної безпеки",
    keywords: ["вразливості", "CVE", "vulnerability"]
  },
  {
    id: 19,
    categoryId: 2,
    name: "Перевірка та контроль усунення вразливостей",
    keywords: ["усунення вразливостей", "патчинг", "виправлення"]
  },
  {
    id: 20,
    categoryId: 2,
    name: "Управління інформаційними активами",
    keywords: ["активами", "інвентаризація", "asset"]
  },
  {
    id: 21,
    categoryId: 2,
    name: "Моніторинг забезпечення конфіденційності інформаційних активів",
    keywords: ["конфіденційність", "DLP"]
  },
  {
    id: 22,
    categoryId: 2,
    name: "Моніторинг забезпечення конфіденційності інформаційних активів в хмарних сервісах",
    keywords: ["хмарні", "cloud", "Azure", "AWS"]
  },
  {
    id: 23,
    categoryId: 2,
    name: "Аналіз ризиків інформаційної безпеки",
    keywords: ["управління ризиками інформаційної безпеки", "ризиками", "ризиків", "ризики"]
  },
  {
    id: 24,
    categoryId: 2,
    name: "Проведення оцінки ризиків інформаційної безпеки",
    keywords: ["оцінка ризиків", "risk assessment"]
  },
  {
    id: 25,
    categoryId: 2,
    name: "Актуалізація зведеної відомості інформаційних активів",
    keywords: ["зведена", "реєстр", "відомість"]
  },
  {
    id: 26,
    categoryId: 2,
    name: "Актуалізація плану обробки ризиків",
    keywords: ["план ризиків", "treatment", "обробки"]
  },
  {
    id: 27,
    categoryId: 2,
    name: "Перегляд (оновлення) матриці ризиків інформаційної безпеки",
    keywords: ["матриця ризиків", "матриці"]
  },
  {
    id: 28,
    categoryId: 2,
    name: "Мінімізація ризиків використання вразливого програмного забезпечення",
    keywords: ["мінімізація", "вразливе ПЗ"]
  },
  {
    id: 29,
    categoryId: 2,
    name: "Дослідження інцидентів",
    keywords: ["дослідження", "incident", "forensics"]
  },
  {
    id: 30,
    categoryId: 2,
    name: "Налаштування та опрацювання подій в інформаційних системах",
    keywords: ["налаштування", "опрацювання"]
  },
  {
    id: 31,
    categoryId: 2,
    name: "Участь в проведенні аудитів інформаційної безпеки та перевірок захищеності елементів інформаційних систем",
    keywords: ["аудит", "перевірка захищеності", "security audit"]
  },
  {
    id: 32,
    categoryId: 2,
    name: "Організація та проведення заходів щодо попередження та запобігання надзвичайним ситуаціям, які можуть виникнути в діяльності Замовника",
    keywords: ["безперервність", "НС", "disaster", "BCP", "надзвичайні"]
  },
  {
    id: 33,
    categoryId: 2,
    name: "Організації навчання (супровід проходження навчання в сфері ІБ. Аналіз логів)",
    keywords: ["навчання та підвищення обізнаності", "навчання", "тренінг", "awareness"]
  },
  {
    id: 34,
    categoryId: 2,
    name: "Підвищення обізнаності співробітників Компанії з питань ІБ",
    keywords: ["підвищення обізнаності", "обізнаності", "фішинг"]
  },
  {
    id: 35,
    categoryId: 2,
    name: "Участь у проведенні службових розслідувань, перевірок та аудитів з питань дотримання Політики інформаційної безпеки",
    keywords: ["розслідувань", "службові", "дотримання"]
  },
  {
    id: 36,
    categoryId: 2,
    name: "Створення нормативної документації в сфері інформаційної безпеки (процедур, стандартів, інструкцій, методології, регламентів, посадових інструкції тощо)",
    keywords: ["управління документацією СУІБ", "документації", "документац", "СУІБ", "нормативна", "процедур", "інструкц", "регламент"]
  },
  {
    id: 37,
    categoryId: 2,
    name: "Плановий/неплановий перегляд нормативної документації в сфері інформаційної безпеки",
    keywords: ["перегляд", "ревізія", "оновлення документ"]
  },
  {
    id: 38,
    categoryId: 2,
    name: "Оновлення учбових матеріалів для організації періодичного навчання в сфері ІБ",
    keywords: ["учбові", "матеріали", "training"]
  },

  // === Категория 3: Анализ киберинцидентов ===
  {
    id: 39,
    categoryId: 3,
    name: "Складання звітності за результатами надання послуг забезпечення кібербезпеки інформаційно-комунікаційних систем, програмних продуктів та інформації",
    keywords: ["звітність", "звіт", "report"]
  },
  {
    id: 40,
    categoryId: 3,
    name: "Перевірки, аналіз та класифікація можливих загроз (аналіз ризиків і їх оцінка при впровадженні нових технологій, модернізації виробництва, формуванні планів технічного оновлення або інших змінах в бізнесі)",
    keywords: ["загроз", "threat", "класифікація"]
  },
  {
    id: 41,
    categoryId: 3,
    name: "Надання звітності щодо інцидентів інформаційної безпеки",
    keywords: ["звітність інцидент", "incident report"]
  },
  {
    id: 42,
    categoryId: 3,
    name: "Надання рекомендацій щодо алгоритмів ліквідації загроз (вибір, оновлення або впровадження програмного забезпечення, зміна правил розмежування доступу та встановлення додаткових засобів захисту інформації)",
    keywords: ["ліквідація", "засоби захисту"]
  },

  // === Категория 4: Планирование и проектирование систем ===
  {
    id: 43,
    categoryId: 4,
    name: "Опрацювання вимог ІБ до рішення вибору проектів",
    keywords: ["вимоги", "проект"]
  },
  {
    id: 44,
    categoryId: 4,
    name: "Опрацювання подій, пов'язаних з доступністю інформації",
    keywords: ["доступність", "availability", "SLA"]
  },
  {
    id: 45,
    categoryId: 4,
    name: "Координування та відстеження прогресу виконання проектів ІБ",
    keywords: ["координ", "прогрес", "project"]
  },
  {
    id: 46,
    categoryId: 4,
    name: "Ведення проектів щодо впровадження рішень ІБ та методологічної підтримки в рамках проектів бізнес функцій",
    keywords: ["методолог", "бізнес"]
  },

  // === Категория 5: Консультации по кибербезопасности ===
  {
    id: 47,
    categoryId: 5,
    name: "Супровід або консультування в рамках проекту",
    keywords: ["управлінська та організаційна діяльність", "організаційн", "управлінськ", "консульт", "супровід"]
  },
  {
    id: 48,
    categoryId: 5,
    name: "Консультування з питань забезпечення та проведення службових перевірок та розслідувань за фактами порушень у сфері інформаційної безпеки",
    keywords: ["консультування перевірки", "розслідування порушень", "incident consultation"]
  },

  // === Категория 6: Эксплуатация и обслуживание ===
  {
    id: 49,
    categoryId: 6,
    name: "Надання послуг з експлуатації та технічного обслуговування комунікаційного обладнання, програмного забезпечення, призначеного для забезпечення кібербезпеки комунікаційних та технологічних систем (мереж)",
    keywords: ["експлуатація обладнання", "технічне обслуговування", "maintenance"]
  },

  // === Категория 7: Исследования и разработки ===
  {
    id: 50,
    categoryId: 7,
    name: "Проведення досліджень та здійснення експериментальних розробок у сфері забезпечення кібербезпеки",
    keywords: ["дослідження", "експериментальні розробки", "R&D", "research"]
  }
];

/**
 * Находит услугу по ключевым словам в названии процесса или описании задачи
 */
export function findServiceByKeywords(text: string): ContractService | undefined {
  if (!text) return undefined;

  const lowerText = text.toLowerCase();

  // Сначала ищем точное совпадение по ключевым словам
  for (const service of CONTRACT_SERVICES) {
    for (const keyword of service.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return service;
      }
    }
  }

  // Если не нашли, ищем частичное совпадение
  const words = lowerText.split(/\s+/).filter(w => w.length > 3);
  for (const service of CONTRACT_SERVICES) {
    for (const keyword of service.keywords) {
      const keywordLower = keyword.toLowerCase();
      for (const word of words) {
        if (keywordLower.includes(word) || word.includes(keywordLower)) {
          return service;
        }
      }
    }
  }

  return undefined;
}

/**
 * Группирует задачи по услугам договора
 */
export function groupTasksByContractService(
  tasks: ContractTaskLike[]
): Map<number, { service: ContractService; tasks: ContractTaskLike[]; category: ServiceCategory }> {
  const result = new Map<number, { service: ContractService; tasks: ContractTaskLike[]; category: ServiceCategory }>();
  const unmappedTasks: ContractTaskLike[] = [];

  for (const task of tasks) {
    // Ищем по названию процесса, потом по описанию задачи
    let service = task.process_name
      ? findServiceByKeywords(task.process_name)
      : undefined;

    if (!service && task.description) {
      service = findServiceByKeywords(task.description);
    }

    if (service) {
      const category = SERVICE_CATEGORIES.find(c => c.id === service!.categoryId)!;
      if (!result.has(service.id)) {
        result.set(service.id, { service, tasks: [], category });
      }
      result.get(service.id)!.tasks.push(task);
    } else {
      unmappedTasks.push(task);
    }
  }

  // Немаппированные задачи добавляем как "Прочие работы" с id=0
  if (unmappedTasks.length > 0) {
    const defaultCategory = SERVICE_CATEGORIES[0]; // Используем первую категорию
    result.set(0, {
      service: {
        id: 0,
        categoryId: 1,
        name: "Інші роботи з забезпечення кібербезпеки",
        keywords: []
      },
      tasks: unmappedTasks,
      category: defaultCategory
    });
  }

  return result;
}

/**
 * Информация о предприятиях для актов
 */
export interface CompanyContractInfo {
  // Исполнитель (наша организация)
  executor: {
    name: string;
    edrpou?: string;
    address?: string;
    representative?: string;
    position?: string;
  };
  // Заказчик (клиент)
  customer: {
    name: string;
    edrpou?: string;
    address?: string;
    representative?: string;
    position?: string;
  };
  // Номер и дата договора
  contract: {
    number: string;
    date: string;
  };
}

/**
 * Конфигурация исполнителя по умолчанию
 * TODO: Перенести в env или системные настройки
 */
export const DEFAULT_EXECUTOR: CompanyContractInfo['executor'] = {
  name: "ТОВ \"Центр кібербезпеки\"",
  representative: "",
  position: "Директор"
};

/**
 * Данные для AI-форматирования описания выполненных работ
 */
export interface TaskDataForAI {
  serviceName: string;
  serviceId: number;
  categoryName: string;
  taskCount: number;
  totalHours: number;
  employees: string[];
  taskDescriptions: string[];
  processName?: string;
}

export interface ContractTaskLike {
  process_name?: string;
  description?: string;
  spent_hours?: number;
  employee_name?: string;
}

/**
 * Подготовка данных для AI-форматирования
 */
export function prepareTasksForAI(
  tasksByService: Map<number, { service: ContractService; tasks: ContractTaskLike[]; category: ServiceCategory }>
): TaskDataForAI[] {
  const result: TaskDataForAI[] = [];

  for (const [, { service, tasks, category }] of Array.from(tasksByService.entries())) {
    const employees = new Set<string>();
    let totalHours = 0;
    const descriptions: string[] = [];
    const processNames = new Set<string>();

    for (const task of tasks) {
      if (task.employee_name) employees.add(task.employee_name);
      totalHours += task.spent_hours || 0;
      if (task.description) descriptions.push(task.description);
      if (task.process_name) processNames.add(task.process_name);
    }

    result.push({
      serviceName: service.name,
      serviceId: service.id,
      categoryName: category.name,
      taskCount: tasks.length,
      totalHours,
      employees: Array.from(employees),
      taskDescriptions: descriptions.slice(0, 15), // Ограничиваем для AI
      processName: processNames.size > 0 ? Array.from(processNames).join(', ') : undefined
    });
  }

  // Сортируем по ID услуги
  return result.sort((a, b) => a.serviceId - b.serviceId);
}

/**
 * Детальная группировка задач по процессам БД
 * Группирует по реальным названиям процессов вместо маппинга на услуги договора
 * Дает более детальную разбивку (~11 строк вместо ~6)
 */
export interface ProcessGroup {
  processName: string;
  tasks: ContractTaskLike[];
  totalHours: number;
  taskCount: number;
  employees: Set<string>;
  descriptions: string[];
}

export function groupTasksByProcess(
  tasks: ContractTaskLike[]
): Map<string, ProcessGroup> {
  const result = new Map<string, ProcessGroup>();

  for (const task of tasks) {
    const processName = task.process_name || 'Інші роботи';

    if (!result.has(processName)) {
      result.set(processName, {
        processName,
        tasks: [],
        totalHours: 0,
        taskCount: 0,
        employees: new Set<string>(),
        descriptions: []
      });
    }

    const group = result.get(processName)!;
    group.tasks.push(task);
    group.taskCount++;
    group.totalHours += task.spent_hours || 0;
    if (task.employee_name) group.employees.add(task.employee_name);
    if (task.description && group.descriptions.length < 20) {
      group.descriptions.push(task.description);
    }
  }

  return result;
}

/**
 * Подготовка детальных данных по процессам для AI-форматирования
 */
export function prepareProcessDataForAI(
  tasksByProcess: Map<string, ProcessGroup>
): TaskDataForAI[] {
  const result: TaskDataForAI[] = [];
  let idx = 1;

  // Сортируем по количеству часов (наибольшие сначала)
  const sortedEntries = Array.from(tasksByProcess.entries())
    .sort((a, b) => b[1].totalHours - a[1].totalHours);

  for (const [processName, group] of sortedEntries) {
    // Находим соответствующую услугу договора для категории
    const service = findServiceByKeywords(processName);
    const category = service
      ? SERVICE_CATEGORIES.find(c => c.id === service.categoryId)
      : SERVICE_CATEGORIES[0];

    result.push({
      serviceName: processName, // Используем реальное название процесса
      serviceId: idx++,
      categoryName: category?.name || 'Забезпечення кібербезпеки ІКС',
      taskCount: group.taskCount,
      totalHours: group.totalHours,
      employees: Array.from(group.employees),
      taskDescriptions: group.descriptions.slice(0, 15),
      processName: processName
    });
  }

  return result;
}
