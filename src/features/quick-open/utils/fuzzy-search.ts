export function fuzzyScore(text: string, query: string): number {
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return 1;
  if (normalizedText === normalizedQuery) return 1000;
  if (normalizedText.startsWith(normalizedQuery)) return 800;
  if (normalizedText.includes(normalizedQuery)) return 600;
  if (normalizedQuery.length <= 2) return 0;

  let textIndex = 0;
  let queryIndex = 0;
  let score = 0;
  let consecutive = 0;
  let gaps = 0;

  while (textIndex < normalizedText.length && queryIndex < normalizedQuery.length) {
    if (normalizedText[textIndex] === normalizedQuery[queryIndex]) {
      score += 10 + consecutive * 5;
      consecutive += 1;
      queryIndex += 1;
    } else {
      if (consecutive > 0) gaps += 1;
      consecutive = 0;
    }
    textIndex += 1;
  }

  if (queryIndex !== normalizedQuery.length) return 0;
  if (gaps > normalizedQuery.length) return 0;

  return Math.max(1, score + Math.max(0, 100 - normalizedText.length) - gaps * 10);
}
