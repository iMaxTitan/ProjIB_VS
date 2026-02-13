export interface TestUser {
  userId: string;
  email: string;
  role: string;
  fullName: string;
  companyId: string;
  departmentName: string;
  departmentId: string;
}

export function getTestUser(): TestUser {
  return {
    userId: process.env.TEST_USER_ID || '',
    email: process.env.TEST_USER_EMAIL || '',
    role: process.env.TEST_USER_ROLE || 'chief',
    fullName: process.env.TEST_USER_FULL_NAME || '',
    companyId: process.env.TEST_USER_COMPANY_ID || '',
    departmentName: process.env.TEST_USER_DEPARTMENT_NAME || '',
    departmentId: process.env.TEST_USER_DEPARTMENT_ID || '',
  };
}
