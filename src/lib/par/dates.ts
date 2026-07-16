/** VM3-03: add N days to a yyyy-mm-dd date string (returns yyyy-mm-dd). */
export const plusDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
