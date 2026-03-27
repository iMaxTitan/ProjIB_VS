import { chromium, FullConfig } from '@playwright/test';
import { authenticateAs, saveAuthState } from '../fixtures/auth';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.test' });

async function globalSetup(config: FullConfig) {
  const authDir = path.join(__dirname, '../.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const baseURL = config.projects[0]?.use?.baseURL || 'https://maxtitan.me:3000';

  console.log('[Global Setup] Authenticating test user...');

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      baseURL,
    });
    const page = await context.newPage();

    await authenticateAs(page);
    await saveAuthState(context, path.join(authDir, 'user.json'));

    await context.close();
    console.log('[Global Setup] Auth state saved to tests/.auth/user.json');
  } finally {
    await browser.close();
  }
}

export default globalSetup;
