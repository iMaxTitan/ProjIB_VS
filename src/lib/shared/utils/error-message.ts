export function getErrorMessage(error: unknown, fallback = 'Неизвестная ошибка'): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized) return serialized;
  } catch {
    // noop
  }
  return fallback;
}
