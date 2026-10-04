const DAY = 86400000;

export function cleanHabits(value, now = Date.now()) {
  if (!Array.isArray(value)) return [];
  return value.filter(event => event && Number.isFinite(event.at) && event.at <= now && event.at > now - 7 * DAY
    && typeof event.category === 'string' && event.category.length > 0 && event.category.length <= 80
    && ['read', 'filter'].includes(event.kind)
    && (event.kind !== 'read' || (typeof event.id === 'string' && event.id.length > 0 && event.id.length <= 256)))
    .slice(-500);
}

export function recommendItems(items, history, now = Date.now()) {
  const habits = cleanHabits(history, now);
  const scores = new Map();
  const read = new Set();
  for (const event of habits) {
    const weight = (event.kind === 'read' ? 4 : 1) / (1 + Math.floor((now - event.at) / DAY));
    scores.set(event.category, (scores.get(event.category) || 0) + weight);
    if (event.kind === 'read') read.add(event.id);
  }
  // ponytail: 根据栏目兴趣做轻量推荐；需要区分细分话题时，再增加条目标签。
  const ranked = items.map((item, index) => ({ item, index }))
    .sort((a, b) => Number(read.has(a.item.id)) - Number(read.has(b.item.id))
      || (scores.get(b.item.category) || 0) - (scores.get(a.item.category) || 0)
      || a.index - b.index).map(entry => entry.item);
  if (habits.length) return ranked.slice(0, 3);
  const preferred = ['AI 前沿', '设计灵感', '前沿交互'].map(category => ranked.find(item => item.category === category)).filter(Boolean);
  return [...preferred, ...ranked.filter(item => !preferred.includes(item))].slice(0, 3);
}
