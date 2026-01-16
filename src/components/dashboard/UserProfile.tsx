import { UserInfo } from '@/types/azure';

interface UserProfileProps {
  user: UserInfo;
}

export default function UserProfile({ user }: UserProfileProps) {
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Не указано';
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const formatPhone = (phone: string | undefined) => {
    if (!phone) return 'Не указано';
    return phone.replace(/(\d{1})(\d{3})(\d{3})(\d{2})(\d{2})/, '+$1 ($2) $3-$4-$5');
  };

  // Преобразуем все данные в массив для таблицы
  const userDataArray = [
    { key: 'Email', value: user.email },
    { key: 'Имя', value: user.displayName },
    { key: 'Должность', value: user.jobTitle || 'Не указано' },
    { key: 'Отдел (Azure)', value: user.departmentAD || 'Не указано' },
    { key: 'Отдел (Система)', value: user.department_name },
    { key: 'Подразделение', value: user.division || 'Не указано' },
    { key: 'Роль', value: user.role }
  ];

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Профиль пользователя
        </h3>
      </div>
      <div className="border-t border-gray-200">
        <dl>
          {userDataArray.map(({ key, value }) => (
            <div key={key} className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">
                {key}
              </dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
} 