# Предложение: Структура квалификаций сотрудников

## Цель
Добавить возможность хранить квалификации/компетенции сотрудников для улучшения контекста AI-помощника при генерации задач и планов.

## Предлагаемые таблицы

### 1. Справочник типов квалификаций
```sql
CREATE TABLE qualification_types (
    qualification_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,          -- Название типа (Сертификация, Навык, Технология и т.д.)
    description TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Начальные данные
INSERT INTO qualification_types (name, description, sort_order) VALUES
('Сертификация', 'Профессиональные сертификаты (CISSP, CEH, ISO27001 и т.д.)', 1),
('Техническая компетенция', 'Владение технологиями и инструментами', 2),
('Функциональная область', 'Области ИБ (Пентест, SOC, Compliance и т.д.)', 3),
('Soft Skills', 'Управленческие и коммуникационные навыки', 4);
```

### 2. Справочник квалификаций
```sql
CREATE TABLE qualifications (
    qualification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qualification_type_id UUID NOT NULL REFERENCES qualification_types(qualification_type_id),
    name VARCHAR(200) NOT NULL,                 -- Название квалификации
    short_name VARCHAR(50),                     -- Краткое название (для отображения)
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Примеры квалификаций
INSERT INTO qualifications (qualification_type_id, name, short_name) VALUES
-- Сертификации
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Сертификация'), 'Certified Information Systems Security Professional', 'CISSP'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Сертификация'), 'Certified Ethical Hacker', 'CEH'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Сертификация'), 'ISO/IEC 27001 Lead Auditor', 'ISO27001 LA'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Сертификация'), 'CISA - Certified Information Systems Auditor', 'CISA'),

-- Технические компетенции
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Техническая компетенция'), 'SIEM (Splunk, QRadar, ELK)', 'SIEM'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Техническая компетенция'), 'Vulnerability Scanner (Nessus, Qualys)', 'VA Tools'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Техническая компетенция'), 'Firewall Administration', 'Firewall'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Техническая компетенция'), 'Active Directory Security', 'AD Security'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Техническая компетенция'), 'Cloud Security (AWS/Azure/GCP)', 'Cloud Sec'),

-- Функциональные области
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Функциональная область'), 'Тестирование на проникновение', 'Pentest'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Функциональная область'), 'Реагирование на инциденты', 'IR'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Функциональная область'), 'Анализ угроз (Threat Intelligence)', 'TI'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Функциональная область'), 'Compliance & Audit', 'Compliance'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Функциональная область'), 'Security Awareness', 'Awareness'),

-- Soft Skills
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Soft Skills'), 'Управление проектами', 'PM'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Soft Skills'), 'Проведение обучения', 'Training'),
((SELECT qualification_type_id FROM qualification_types WHERE name = 'Soft Skills'), 'Написание документации', 'Docs');
```

### 3. Связь сотрудников с квалификациями
```sql
CREATE TABLE user_qualifications (
    user_qualification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    qualification_id UUID NOT NULL REFERENCES qualifications(qualification_id),
    proficiency_level INT DEFAULT 3 CHECK (proficiency_level BETWEEN 1 AND 5),  -- 1-начинающий, 5-эксперт
    acquired_date DATE,                         -- Дата получения/подтверждения
    expiry_date DATE,                           -- Дата истечения (для сертификатов)
    notes TEXT,                                 -- Примечания
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, qualification_id)
);

-- Индексы
CREATE INDEX idx_user_qualifications_user_id ON user_qualifications(user_id);
CREATE INDEX idx_user_qualifications_qualification_id ON user_qualifications(qualification_id);
```

### 4. View для удобного получения квалификаций
```sql
CREATE OR REPLACE VIEW v_user_qualifications AS
SELECT
    uq.user_qualification_id,
    uq.user_id,
    up.full_name,
    up.email,
    uq.qualification_id,
    q.name AS qualification_name,
    q.short_name AS qualification_short_name,
    qt.name AS qualification_type,
    uq.proficiency_level,
    uq.acquired_date,
    uq.expiry_date,
    CASE WHEN uq.expiry_date IS NOT NULL AND uq.expiry_date < CURRENT_DATE THEN true ELSE false END AS is_expired,
    uq.notes
FROM user_qualifications uq
JOIN user_profiles up ON up.user_id = uq.user_id
JOIN qualifications q ON q.qualification_id = uq.qualification_id
JOIN qualification_types qt ON qt.qualification_type_id = q.qualification_type_id
WHERE q.is_active = true
ORDER BY up.full_name, qt.sort_order, q.name;
```

### 5. Функция для получения квалификаций массивом
```sql
CREATE OR REPLACE FUNCTION get_user_qualifications_array(p_user_id UUID)
RETURNS TEXT[] AS $$
    SELECT COALESCE(
        array_agg(
            CASE
                WHEN q.short_name IS NOT NULL THEN q.short_name
                ELSE q.name
            END
            ORDER BY qt.sort_order, q.name
        ),
        ARRAY[]::TEXT[]
    )
    FROM user_qualifications uq
    JOIN qualifications q ON q.qualification_id = uq.qualification_id
    JOIN qualification_types qt ON qt.qualification_type_id = q.qualification_type_id
    WHERE uq.user_id = p_user_id
    AND q.is_active = true
    AND (uq.expiry_date IS NULL OR uq.expiry_date >= CURRENT_DATE);
$$ LANGUAGE SQL STABLE;
```

### 6. Обновление v_user_details
```sql
-- Добавить колонку qualifications в существующий view
CREATE OR REPLACE VIEW v_user_details AS
SELECT
    up.user_id,
    up.email,
    up.full_name,
    up.role,
    up.status,
    up.department_id,
    d.department_name,
    up.photo_base64,
    up.created_at,
    up.updated_at,
    get_user_qualifications_array(up.user_id) AS qualifications
FROM user_profiles up
LEFT JOIN departments d ON d.department_id = up.department_id;
```

## Использование в AI-контексте

После применения миграции, данные автоматически будут доступны через `v_user_details.qualifications` как массив строк.

Пример передачи в AI:
```typescript
// WeeklyPlanDetails.tsx
assignees={assignees.map(a => ({
    full_name: a.full_name,
    role: a.role,
    qualifications: a.qualifications  // ['CISSP', 'Pentest', 'SIEM']
}))}
```

AI получит контекст вида:
```
[ИСПОЛНИТЕЛИ]
- Иванов Иван (Специалист): CISSP, Pentest, SIEM
- Петров Петр (Аналитик): CISA, Compliance, Docs
```

## Преимущества такой структуры

1. **Гибкость**: Легко добавлять новые типы квалификаций и сами квалификации
2. **Нормализация**: Нет дублирования данных, единый справочник
3. **Уровни владения**: 5-балльная шкала позволяет учитывать опыт
4. **Срок действия**: Для сертификатов можно отслеживать истечение
5. **Производительность**: Функция `get_user_qualifications_array` эффективно агрегирует данные
6. **Совместимость**: Минимальные изменения в существующем коде

## План внедрения

1. Создать таблицы и заполнить справочники
2. Обновить view `v_user_details`
3. Добавить UI для управления квалификациями сотрудников
4. Передавать квалификации в AI-контекст (уже подготовлено в коде)

## Миграция

Файл миграции: `scripts/migrations/add_user_qualifications.sql`
