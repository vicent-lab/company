export const fmt = {
  num: (n: number, d = 0) =>
    n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }),
  money: (n: number) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  money2: (n: number) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pct: (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`,
  date: (d: string | Date) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  shortDate: (d: string | Date) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  liters: (n: number) => `${fmt.num(n, 0)} L`,
  kg: (n: number) => `${fmt.num(n, 0)} kg`,
  cls: (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' '),
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
