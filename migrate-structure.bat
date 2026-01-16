@echo off

REM Создаем новую структуру директорий
mkdir src\app\api
mkdir src\app\auth
mkdir src\app\dashboard
mkdir src\app\employees
mkdir src\components\layout
mkdir src\components\sidebar
mkdir src\components\dashboard
mkdir src\lib
mkdir src\types
mkdir src\styles

REM Переносим файлы из pages в app
xcopy /E /I /H src\pages\api\* src\app\api\
xcopy /E /I /H src\pages\auth\* src\app\auth\

REM Переносим компоненты
move src\pages\dashboard.tsx src\app\dashboard\page.tsx
move src\pages\employees.tsx src\app\employees\page.tsx

REM Переносим layout компоненты
move src\components\layout\DashboardLayout.tsx src\components\layout\

REM Переносим sidebar компоненты
move src\components\sidebar\Sidebar.tsx src\components\sidebar\

REM Переносим dashboard компоненты
move src\components\dashboard\*.tsx src\components\dashboard\

REM Оставляем только необходимые файлы в pages
mkdir src\pages
echo. > src\pages\_app.tsx
echo. > src\pages\_document.tsx

REM Создаем README.md в каждой директории
echo # API Routes > src\app\api\README.md
echo # Authentication > src\app\auth\README.md
echo # Dashboard > src\app\dashboard\README.md
echo # Employees > src\app\employees\README.md
echo # Layout Components > src\components\layout\README.md
echo # Sidebar Components > src\components\sidebar\README.md
echo # Dashboard Components > src\components\dashboard\README.md
echo # Utilities > src\lib\README.md
echo # Types > src\types\README.md
echo # Styles > src\styles\README.md

echo ✅ Структура проекта обновлена согласно правилам
echo 📁 Проверьте новые директории и файлы
echo ⚠️ Не забудьте обновить импорты в файлах 