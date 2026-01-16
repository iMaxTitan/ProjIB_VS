#!/bin/bash

# Создаем новую структуру директорий
mkdir -p src/app/{api,auth,dashboard,employees}
mkdir -p src/components/{layout,sidebar,dashboard}
mkdir -p src/lib
mkdir -p src/types
mkdir -p src/styles

# Переносим файлы из pages в app
mv src/pages/api/* src/app/api/ 2>/dev/null || true
mv src/pages/auth/* src/app/auth/ 2>/dev/null || true

# Переносим компоненты
mv src/pages/dashboard.tsx src/app/dashboard/page.tsx 2>/dev/null || true
mv src/pages/employees.tsx src/app/employees/page.tsx 2>/dev/null || true

# Переносим layout компоненты
mv src/components/DashboardLayout.tsx src/components/layout/ 2>/dev/null || true

# Переносим sidebar компоненты
mv src/components/Sidebar.tsx src/components/sidebar/ 2>/dev/null || true

# Переносим dashboard компоненты
mv src/components/Dashboard*.tsx src/components/dashboard/ 2>/dev/null || true

# Оставляем только необходимые файлы в pages
mkdir -p src/pages
touch src/pages/_app.tsx
touch src/pages/_document.tsx

# Создаем README.md в каждой директории
echo "# API Routes" > src/app/api/README.md
echo "# Authentication" > src/app/auth/README.md
echo "# Dashboard" > src/app/dashboard/README.md
echo "# Employees" > src/app/employees/README.md
echo "# Layout Components" > src/components/layout/README.md
echo "# Sidebar Components" > src/components/sidebar/README.md
echo "# Dashboard Components" > src/components/dashboard/README.md
echo "# Utilities" > src/lib/README.md
echo "# Types" > src/types/README.md
echo "# Styles" > src/styles/README.md

# Выводим сообщение о завершении
echo "✅ Структура проекта обновлена согласно правилам"
echo "📁 Проверьте новые директории и файлы"
echo "⚠️ Не забудьте обновить импорты в файлах" 