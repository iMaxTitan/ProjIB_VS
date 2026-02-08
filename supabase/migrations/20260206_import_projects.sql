-- ============================================
-- Import Projects - 2026-02-06
-- Імпорт проектів та прив'язка до всіх департаментів
-- ============================================

-- Тимчасова таблиця для зберігання ID департаментів
DO $$
DECLARE
    dept_uibk UUID := '2c460943-e6d1-48e3-8300-7491ef2b37d8';  -- УИБК
    dept_svk UUID := '9beab000-39d0-4d7a-952d-242cef86d0f0';   -- СВК
    dept_smur UUID := '62f49b72-e9b2-481a-af87-3d459a8eba28';  -- СМУР
    dept_okb UUID := '36dab3d8-2c16-4c1c-ae8c-b62367482a7e';   -- ОКБ
    new_project_id UUID;
BEGIN
    -- 1. Електронний чек (Е-Чек)
    INSERT INTO projects (project_name, is_active) VALUES ('Електронний чек (Е-Чек)', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 2. Спрощення підключення карток до еЧеку
    INSERT INTO projects (project_name, is_active) VALUES ('Спрощення підключення карток до еЧеку', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 3. Гаманець АТБ
    INSERT INTO projects (project_name, is_active) VALUES ('Гаманець АТБ', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 4. Цифрова система лояльності клієнтів АТБ
    INSERT INTO projects (project_name, is_active) VALUES ('Цифрова система лояльності клієнтів АТБ', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 5. Лояльність. Ідентифікація
    INSERT INTO projects (project_name, is_active) VALUES ('Лояльність. Ідентифікація', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 6. Лояльність. Конструктор знижок
    INSERT INTO projects (project_name, is_active) VALUES ('Лояльність. Конструктор знижок', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 7. Лояльність. Купони
    INSERT INTO projects (project_name, is_active) VALUES ('Лояльність. Купони', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 8. Лояльність. Комунікація з клієнтами
    INSERT INTO projects (project_name, is_active) VALUES ('Лояльність. Комунікація з клієнтами', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 9. Лояльність. Персональні знижки
    INSERT INTO projects (project_name, is_active) VALUES ('Лояльність. Персональні знижки', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 10. Зона сервісів
    INSERT INTO projects (project_name, is_active) VALUES ('Зона сервісів', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 11. Поповнення карти – продаж Сертифіката поповнення
    INSERT INTO projects (project_name, is_active) VALUES ('Поповнення карти – продаж Сертифіката поповнення', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 12. Поповнення карт на касі через NFC пристрої
    INSERT INTO projects (project_name, is_active) VALUES ('Поповнення карт на касі через NFC пристрої', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 13. Мобільний помічник продавця
    INSERT INTO projects (project_name, is_active) VALUES ('Мобільний помічник продавця', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 14. Разработка МП 2.0
    INSERT INTO projects (project_name, is_active) VALUES ('Разработка МП 2.0', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 15. Лотерейні білети. Продаж, виплата подарункових сертифікатів
    INSERT INTO projects (project_name, is_active) VALUES ('Лотерейні білети. Продаж, виплата подарункових сертифікатів', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 16. Електронні журнали магазинів
    INSERT INTO projects (project_name, is_active) VALUES ('Електронні журнали магазинів', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 17. Розпорядження для магазинів
    INSERT INTO projects (project_name, is_active) VALUES ('Розпорядження для магазинів', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 18. Інтернет-магазин
    INSERT INTO projects (project_name, is_active) VALUES ('Інтернет-магазин', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 19. Реалізація сертифікатів для ЗСУ
    INSERT INTO projects (project_name, is_active) VALUES ('Реалізація сертифікатів для ЗСУ', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 20. Інтеграція КЦ АТБ з МД АТБ
    INSERT INTO projects (project_name, is_active) VALUES ('Інтеграція КЦ АТБ з МД АТБ', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 21. Система аукціонування ЗЕД
    INSERT INTO projects (project_name, is_active) VALUES ('Система аукціонування ЗЕД', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 22. Столова нового офіса
    INSERT INTO projects (project_name, is_active) VALUES ('Столова нового офіса', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 23. NAC (Cisco ISE)_Доступ VPN
    INSERT INTO projects (project_name, is_active) VALUES ('NAC (Cisco ISE)_Доступ VPN', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 24. NAC (Cisco ISE)_Доступ WI-FI
    INSERT INTO projects (project_name, is_active) VALUES ('NAC (Cisco ISE)_Доступ WI-FI', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 25. Впровадження NAC Cisco ISE при використанні Ethernet в новому офісі
    INSERT INTO projects (project_name, is_active) VALUES ('Впровадження NAC Cisco ISE при використанні Ethernet в новому офісі', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 26. Портал біллінгу Приватна хмара АТБ
    INSERT INTO projects (project_name, is_active) VALUES ('Портал біллінгу Приватна хмара АТБ', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 27. Зберігання персональних даних для мобільного додатку
    INSERT INTO projects (project_name, is_active) VALUES ('Зберігання персональних даних для мобільного додатку', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 28. Організація платного паркування
    INSERT INTO projects (project_name, is_active) VALUES ('Організація платного паркування', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 29. Розробка акційної механіки (Кратність суми чеку для знижки)
    INSERT INTO projects (project_name, is_active) VALUES ('Розробка акційної механіки (Кратність суми чеку для знижки)', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 30. Впровадження програмного РРО для Скануй-Купуй
    INSERT INTO projects (project_name, is_active) VALUES ('Впровадження програмного РРО для Скануй-Купуй', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 31. Розробка схеми обміну інформацією між співробітниками підрозділу та підрядною організацією
    INSERT INTO projects (project_name, is_active) VALUES ('Розробка схеми обміну інформацією між співробітниками підрозділу та підрядною організацією', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 32. Доработки ІС 0111 OmniTracker «Інтеграція з системами підрядників через веб-сервіс»
    INSERT INTO projects (project_name, is_active) VALUES ('Доработки ІС 0111 OmniTracker «Інтеграція з системами підрядників через веб-сервіс»', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 33. Облік ліцензій на ЛГВ та табак по фіскальним номерам РРО-ПРРО
    INSERT INTO projects (project_name, is_active) VALUES ('Облік ліцензій на ЛГВ та табак по фіскальним номерам РРО-ПРРО', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 34. Опрацювання варіантів заміни системи «Директум»
    INSERT INTO projects (project_name, is_active) VALUES ('Опрацювання варіантів заміни системи «Директум»', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 35. Заявки на доступ до ІР
    INSERT INTO projects (project_name, is_active) VALUES ('Заявки на доступ до ІР', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 36. Логування подій у всіх екземплярах 1С для передачі у SIEM
    INSERT INTO projects (project_name, is_active) VALUES ('Логування подій у всіх екземплярах 1С для передачі у SIEM', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 37. Звірка ЕЦП
    INSERT INTO projects (project_name, is_active) VALUES ('Звірка ЕЦП', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 38. Пролонгація ЕЦП
    INSERT INTO projects (project_name, is_active) VALUES ('Пролонгація ЕЦП', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 39. Акції з акційними кодами
    INSERT INTO projects (project_name, is_active) VALUES ('Акції з акційними кодами', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 40. Аналітичні звіти постачальникам
    INSERT INTO projects (project_name, is_active) VALUES ('Аналітичні звіти постачальникам', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 41. Звіт SAF-T UA
    INSERT INTO projects (project_name, is_active) VALUES ('Звіт SAF-T UA', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 42. Ко-бренд промо "Диволови купують з карткою АТБ від Visa"
    INSERT INTO projects (project_name, is_active) VALUES ('Ко-бренд промо "Диволови купують з карткою АТБ від Visa"', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 43. Спрощення процедури реєстрації еЧеку
    INSERT INTO projects (project_name, is_active) VALUES ('Спрощення процедури реєстрації еЧеку', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 44. Облік товарних втрат
    INSERT INTO projects (project_name, is_active) VALUES ('Облік товарних втрат', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 45. Портал Постачальника
    INSERT INTO projects (project_name, is_active) VALUES ('Портал Постачальника', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    -- 46. Автоматизація обліку та розрахунку заробітної плати працівників «М'ясна фабрика «Фаворит Плюс» у 1С 8.3 ЗУП
    INSERT INTO projects (project_name, is_active) VALUES ('Автоматизація обліку та розрахунку заробітної плати працівників «М''ясна фабрика «Фаворит Плюс» у 1С 8.3 ЗУП', true) RETURNING project_id INTO new_project_id;
    INSERT INTO project_departments (project_id, department_id) VALUES (new_project_id, dept_uibk), (new_project_id, dept_svk), (new_project_id, dept_smur), (new_project_id, dept_okb);

    RAISE NOTICE 'Imported 46 projects and linked to all 4 departments';
END $$;
