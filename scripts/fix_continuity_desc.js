const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

async function main() {
  const description = `Політика безперервності інформаційної безпеки визначає підхід Компанії до забезпечення безперервності функцій інформаційної безпеки та відновлення ключових інформаційних систем ІБ після кризових ситуацій.
Метою є мінімізація наслідків від серйозних інцидентів (кібератак, технічних збоїв тощо) та забезпечення відновлення роботи у прийнятні для бізнесу терміни.`;

  const { error } = await supabase
    .from('processes')
    .update({ description })
    .eq('process_name', 'Безперервність інформаційної безпеки');

  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('✓ Безперервність інформаційної безпеки - оновлено!');
  }
}

main();
