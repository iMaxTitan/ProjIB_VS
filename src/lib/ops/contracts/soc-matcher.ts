/**
 * Contract services — logic functions and report types.
 * Static mapping data (SERVICE_CATEGORIES, CONTRACT_SERVICES) is in contract-mapping.ts.
 */

import { ContractService, ServiceCategory, SERVICE_CATEGORIES, CONTRACT_SERVICES } from './soc-catalog';
import { config } from '@/lib/shared/config';
export * from './soc-catalog';

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

export const DEFAULT_EXECUTOR: CompanyContractInfo['executor'] = {
  name:           config.executor.name,
  representative: config.executor.representative,
  position:       config.executor.position,
};

/**
 * Реквізити договору для шапки звіту
 */
export const DEFAULT_CONTRACT = {
  number: '01/07-2022/1',
  date: '01 липня 2022 року',
  dkCode: '62.09',
  dkDescription: 'інша діяльність у сфері інформаційних технологій і комп\'ютерних систем',
  pidstavaPrefix: 'Заявка про надання послуг забезпечення кібербезпеки інформаційно-комунікаційних систем, програмних продуктів та інформації',
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
