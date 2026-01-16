const fs = require('fs');
const path = require('path');

// Функция для обновления импортов в файле
function updateImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Обновляем импорты из pages
  content = content.replace(
    /from ['"]@\/pages\/([^'"]+)['"]/g,
    (match, p1) => {
      if (p1.startsWith('api/') || p1.startsWith('auth/')) {
        return `from '@/app/${p1}'`;
      }
      return `from '@/app/${p1}/page'`;
    }
  );
  
  // Обновляем импорты из components
  content = content.replace(
    /from ['"]@\/components\/([^'"]+)['"]/g,
    (match, p1) => {
      if (p1.startsWith('Dashboard')) {
        return `from '@/components/dashboard/${p1}'`;
      }
      if (p1 === 'Sidebar') {
        return `from '@/components/sidebar/${p1}'`;
      }
      if (p1 === 'DashboardLayout') {
        return `from '@/components/layout/${p1}'`;
      }
      return match;
    }
  );
  
  fs.writeFileSync(filePath, content);
}

// Рекурсивно обходим все файлы
function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      updateImports(filePath);
    }
  }
}

// Запускаем обновление
processDirectory('src');

console.log('✅ Импорты обновлены');
console.log('⚠️ Проверьте изменения в файлах'); 