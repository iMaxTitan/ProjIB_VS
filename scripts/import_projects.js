const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const SUPABASE_HOSTNAME = new URL(SUPABASE_URL).hostname;

const DEPARTMENTS = [
  '2c460943-e6d1-48e3-8300-7491ef2b37d8', // УИБК
  '9beab000-39d0-4d7a-952d-242cef86d0f0', // СВК
  '62f49b72-e9b2-481a-af87-3d459a8eba28', // СМУР
  '36dab3d8-2c16-4c1c-ae8c-b62367482a7e', // ОКБ
];

const PROJECTS = [
  'Електронний чек (Е-Чек)',
  'Спрощення підключення карток до еЧеку',
  'Гаманець АТБ',
  'Цифрова система лояльності клієнтів АТБ',
  'Лояльність. Ідентифікація',
  'Лояльність. Конструктор знижок',
  'Лояльність. Купони',
  'Лояльність. Комунікація з клієнтами',
  'Лояльність. Персональні знижки',
  'Зона сервісів',
  'Поповнення карти – продаж Сертифіката поповнення',
  'Поповнення карт на касі через NFC пристрої',
  'Мобільний помічник продавця',
  'Разработка МП 2.0',
  'Лотерейні білети. Продаж, виплата подарункових сертифікатів',
  'Електронні журнали магазинів',
  'Розпорядження для магазинів',
  'Інтернет-магазин',
  'Реалізація сертифікатів для ЗСУ',
  'Інтеграція КЦ АТБ з МД АТБ',
  'Система аукціонування ЗЕД',
  'Столова нового офіса',
  'NAC (Cisco ISE)_Доступ VPN',
  'NAC (Cisco ISE)_Доступ WI-FI',
  'Впровадження NAC Cisco ISE при використанні Ethernet в новому офісі',
  'Портал біллінгу Приватна хмара АТБ',
  'Зберігання персональних даних для мобільного додатку',
  'Організація платного паркування',
  'Розробка акційної механіки (Кратність суми чеку для знижки)',
  'Впровадження програмного РРО для Скануй-Купуй',
  'Розробка схеми обміну інформацією між співробітниками підрозділу та підрядною організацією',
  'Доработки ІС 0111 OmniTracker «Інтеграція з системами підрядників через веб-сервіс»',
  'Облік ліцензій на ЛГВ та табак по фіскальним номерам РРО-ПРРО',
  'Опрацювання варіантів заміни системи «Директум»',
  'Заявки на доступ до ІР',
  'Логування подій у всіх екземплярах 1С для передачі у SIEM',
  'Звірка ЕЦП',
  'Пролонгація ЕЦП',
  'Акції з акційними кодами',
  'Аналітичні звіти постачальникам',
  'Звіт SAF-T UA',
  'Ко-бренд промо "Диволови купують з карткою АТБ від Visa"',
  'Спрощення процедури реєстрації еЧеку',
  'Облік товарних втрат',
  'Портал Постачальника',
  "Автоматизація обліку та розрахунку заробітної плати працівників «М'ясна фабрика «Фаворит Плюс» у 1С 8.3 ЗУП",
];

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_HOSTNAME,
      port: 443,
      path: path,
      method: method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log(`Importing ${PROJECTS.length} projects...`);
  let success = 0;
  let failed = 0;

  for (const projectName of PROJECTS) {
    try {
      // Insert project
      const projectResult = await request('POST', '/rest/v1/projects', {
        project_name: projectName,
        is_active: true,
      });

      if (projectResult && projectResult[0] && projectResult[0].project_id) {
        const projectId = projectResult[0].project_id;

        // Link to all departments
        const links = DEPARTMENTS.map(deptId => ({
          project_id: projectId,
          department_id: deptId,
        }));

        await request('POST', '/rest/v1/project_departments', links);
        console.log(`✓ ${projectName}`);
        success++;
      } else {
        console.log(`✗ ${projectName}: ${JSON.stringify(projectResult)}`);
        failed++;
      }
    } catch (err) {
      console.log(`✗ ${projectName}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone! Success: ${success}, Failed: ${failed}`);
}

main();
