const { execSync } = require('child_process');

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'inherit' });
  console.log('Git hooks configured: core.hooksPath=.githooks');
} catch (error) {
  console.error('Failed to configure git hooks path.');
  process.exit(1);
}

