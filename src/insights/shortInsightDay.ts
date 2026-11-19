/** YYYY-MM-DD → MM-DD for compact chart axis labels. */
export function shortInsightDay(day: string): string {
  return day.length >= 10 ? day.slice(5) : day;
}
