export function getKPIBarColor(percent: number): 'red' | 'yellow' | 'green' {
  if (percent < 51) {
    return 'red';
  }
  if (percent < 75) {
    return 'yellow';
  }
  return 'green';
}
