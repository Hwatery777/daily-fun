import { cleanHabits, recommendItems } from './recommendations.js';

const grid = document.getElementById('news-grid');
const message = document.getElementById('message');
const categories = document.getElementById('categories');
const status = document.getElementById('status');
const contentTypes = { article: ['文章', '阅读原文 ↗'], video: ['视频', '观看视频 ↗'], inspiration: ['灵感', '浏览作品 ↗'] };
let items = [];
let selected = null;
const desktop = window.matchMedia('(min-width: 768px)');
const historyKey = 'daily-fun-habits';
let habits = [];
let storageAvailable = true;
let savedHistory = null;
try { savedHistory = localStorage.getItem(historyKey); }
catch { storageAvailable = false; }
try { habits = cleanHabits(JSON.parse(savedHistory)); } catch { /* 损坏记录按首次阅读处理。 */ }

function validateItems(data) {
  if (!Array.isArray(data)) throw new Error('日报内容应是一组条目。');
  const ids = new Set();
  const counts = { lead: 0, important: 0, normal: 0 };
  for (const item of data) {
    for (const key of ['id', 'title', 'brief', 'summary', 'category', 'priority', 'sourceName', 'sourceUrl']) {
      if (typeof item?.[key] !== 'string' || !item[key].trim()) throw new Error('某条内容缺少必要文字。');
    }
    if (ids.has(item.id)) throw new Error('有两条内容使用了相同编号。');
    ids.add(item.id);
    if (!Object.hasOwn(counts, item.priority)) throw new Error('某条内容的版面级别不正确。');
    counts[item.priority] += 1;
    let url;
    try { url = new URL(item.sourceUrl); } catch { throw new Error('某条内容的来源地址不完整。'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('某条内容的来源地址不安全。');
    if (item.contentType !== undefined && !Object.hasOwn(contentTypes, item.contentType)) throw new Error('某条内容的类型设置不正确。');
    if (item.imageUrl !== undefined) {
      let image;
      try { image = new URL(item.imageUrl); } catch { throw new Error('某条内容的配图地址不完整。'); }
      if (image.protocol !== 'https:') throw new Error('配图需要使用安全的图片地址。');
      if (item.imageAlt !== undefined && typeof item.imageAlt !== 'string') throw new Error('某条配图的说明格式不正确。');
    }
  }
  if (counts.lead > 2 || counts.important > 4) throw new Error('头条最多两条，重点最多四条。');
  return data;
}

function applyTheme(theme) {
  const fonts = {
    sans: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    serif: '"Songti SC", "STSong", "SimSun", Georgia, serif',
    mono: '"SFMono-Regular", "Menlo", "PingFang SC", monospace'
  };
  if (!theme || typeof theme.name !== 'string' || !theme.name.trim()) throw new Error('日报名称尚未设置。');
  for (const key of ['background', 'textColor', 'accentColor']) {
    if (typeof theme[key] !== 'string' || !/^#[\da-f]{6}$/i.test(theme[key])) throw new Error('主题颜色格式不正确。');
  }
  if (!Object.hasOwn(fonts, theme.titleFont) || !['comfortable', 'compact'].includes(theme.density)) throw new Error('字体或页面紧凑程度设置不正确。');
  const root = document.documentElement;
  root.style.setProperty('--background', theme.background);
  root.style.setProperty('--ink', theme.textColor);
  root.style.setProperty('--accent', theme.accentColor);
  root.style.setProperty('--headline', fonts[theme.titleFont]);
  document.body.dataset.density = theme.density;
  document.title = theme.name;
  const dot = document.createElement('span');
  dot.className = 'name-dot';
  dot.textContent = '.';
  dot.setAttribute('aria-hidden', 'true');
  document.getElementById('paper-name').replaceChildren(document.createTextNode(theme.name), dot);
  document.getElementById('footer-name').textContent = theme.name;
}

function showMessage(title, body, retry = false) {
  document.getElementById('message-title').textContent = title;
  document.getElementById('message-body').textContent = body;
  document.getElementById('retry').hidden = !retry;
  message.hidden = false;
}

function createArticle(item, priority = item.priority) {
    const article = document.getElementById('article-template').content.firstElementChild.cloneNode(true);
    article.classList.add(priority);
    article.dataset.id = item.id;
    article.querySelector('.item-category').textContent = item.category;
    const type = contentTypes[item.contentType || 'article'];
    article.querySelector('.item-type').textContent = type[0];
    const cardLink = article.querySelector('.card-link');
    cardLink.textContent = item.title;
    cardLink.href = item.sourceUrl;
    cardLink.setAttribute('aria-label', `${item.title}，在新标签页打开原始来源`);
    article.querySelector('.item-brief').textContent = item.brief;
    article.querySelector('.item-summary').textContent = item.summary;
    article.querySelector('.source-name').textContent = item.sourceName;
    const link = article.querySelector('.source-link');
    link.href = item.sourceUrl;
    article.querySelector('.source-action').textContent = type[1];
    link.setAttribute('aria-label', `在新标签页打开 ${item.sourceName} 的原文：${item.title}`);
    if (item.imageUrl) {
      const wrapper = article.querySelector('.item-image');
      const image = wrapper.querySelector('img');
      wrapper.hidden = false;
      article.classList.add('has-image');
      image.alt = item.imageAlt || '';
      if (priority === 'lead') image.loading = 'eager';
      image.addEventListener('error', () => { wrapper.hidden = true; article.classList.remove('has-image'); }, { once: true });
      image.src = item.imageUrl;
    }
    article.addEventListener('click', event => {
      if (event.target.closest('a')) recordHabit(item.category, item.id);
    });
    return article;
}

function recordHabit(category, id) {
  habits = cleanHabits(habits);
  const now = Date.now();
  if (habits.some(event => event.category === category && event.id === id && now - event.at < 60000)) return;
  habits.push({ at: now, category, ...(id ? { id } : {}), kind: id ? 'read' : 'filter' });
  habits = habits.slice(-500);
  try { localStorage.setItem(historyKey, JSON.stringify(habits)); }
  catch { storageAvailable = false; }
  renderRecommendations();
}

function renderRecommendations() {
  const section = document.getElementById('recommendations');
  section.hidden = !items.length;
  if (!items.length) return;
  const picks = recommendItems(items, habits);
  document.getElementById('recommendation-grid').replaceChildren(...picks.map(item => createArticle(item, 'normal')));
  document.getElementById('recommendation-note').textContent = habits.length
    ? '参考你近七天在日报内的原文点击与栏目选择，从本期内容中优先挑选尚未打开的条目。'
    : '先从你关注的 AI、设计和前沿交互中挑选三条。阅读后，推荐会逐步贴近你的兴趣。';
  document.getElementById('history-note').textContent = storageAvailable
    ? '阅读记录仅保存在当前浏览器，不上传。换浏览器后会重新开始。'
    : '当前浏览器未能保存阅读记录，本次推荐仍可使用；刷新后可能重新开始。';
  document.getElementById('clear-history').disabled = !habits.length;
}

function createCarousel(leads) {
  const section = document.createElement('section');
  section.className = 'lead-carousel';
  section.setAttribute('aria-label', '头条精选');
  section.setAttribute('aria-roledescription', '轮播');
  section.innerHTML = '<div class="carousel-heading"><span class="section-label">今日头条</span><div class="carousel-controls"><button type="button" aria-label="上一条头条">←</button><span class="carousel-counter" role="status" aria-live="polite"></span><button type="button" aria-label="下一条头条">→</button></div></div><div class="carousel-track" tabindex="0" aria-label="头条内容，可用左右方向键切换"></div>';
  const track = section.querySelector('.carousel-track');
  const cards = leads.map(item => createArticle(item));
  track.append(...cards);
  let current = 0;
  const update = () => {
    current = desktop.matches && track.clientWidth ? Math.min(cards.length - 1, Math.round(track.scrollLeft / track.clientWidth)) : 0;
    section.querySelector('.carousel-counter').textContent = String(current + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
    cards.forEach((card, index) => {
      card.inert = desktop.matches && index !== current;
      if (card.inert) card.setAttribute('aria-hidden', 'true');
      else card.removeAttribute('aria-hidden');
    });
  };
  const move = step => {
    if (!desktop.matches) return;
    const next = (current + step + cards.length) % cards.length;
    track.scrollTo({ left: next * track.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  section.querySelector('[aria-label="上一条头条"]').addEventListener('click', () => move(-1));
  section.querySelector('[aria-label="下一条头条"]').addEventListener('click', () => move(1));
  track.addEventListener('scroll', update, { passive: true });
  track.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); }
  });
  update();
  return section;
}

function render() {
  const visible = selected === null ? items : items.filter(item => item.category === selected);
  document.getElementById('frontier-intro').hidden = selected !== '前沿交互';
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < visible.length; index += 1) {
    const item = visible[index];
    // 只合并相邻头条，避免调整 JSON 中的内容顺序。
    if (item.priority === 'lead' && visible[index + 1]?.priority === 'lead') {
      fragment.append(createCarousel([item, visible[++index]]));
    } else fragment.append(createArticle(item));
  }
  grid.replaceChildren(fragment);
  grid.setAttribute('aria-busy', 'false');
  message.hidden = true;
  if (!visible.length) showMessage('这一版还没有内容', '告诉我你想关注的主题，我会帮你整理并加入日报。');
  document.getElementById('item-count').textContent = `${visible.length} 条精选`;
  status.textContent = `已显示${selected === null ? '全部' : selected}内容，共 ${visible.length} 条。`;
  renderRecommendations();
}

function buildCategories() {
  categories.replaceChildren();
  for (const category of [null, ...new Set([...items.map(item => item.category), '前沿交互'])]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category === null ? '全部' : category;
    button.setAttribute('aria-pressed', String(category === selected));
    button.addEventListener('click', () => {
      selected = category;
      if (category !== null) recordHabit(category);
      for (const sibling of categories.children) sibling.setAttribute('aria-pressed', String(sibling === button));
      render();
    });
    categories.append(button);
  }
}

async function load() {
  grid.setAttribute('aria-busy', 'true');
  message.hidden = true;
  status.textContent = '正在读取日报。';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let responses;
    try {
      responses = await Promise.all(['./theme.json', './data.json'].map(path => fetch(path, { cache: 'no-store', signal: controller.signal })));
      if (responses.some(response => !response.ok)) throw new Error('内容或主题文件暂时无法读取。');
      const [theme, data] = await Promise.all(responses.map(response => response.json()));
      const validated = validateItems(data);
      applyTheme(theme);
      items = validated;
    } finally { clearTimeout(timeout); }
    selected = null;
    const modified = new Date(responses[1].headers.get('Last-Modified') || Date.now());
    const date = document.getElementById('edition-date');
    date.dateTime = modified.toISOString();
    date.textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(modified);
    // ponytail: demo- 编号标记演示内容；需要混合多种版本时再加独立版本信息。
    const demo = items.some(item => item.id.startsWith('demo-'));
    document.getElementById('reading-note').hidden = !demo;
    document.getElementById('edition-mode').textContent = demo ? '演示版 / 内容示例' : '个人信息日报';
    buildCategories();
    render();
  } catch (error) {
    document.getElementById('recommendations').hidden = true;
    grid.replaceChildren();
    grid.setAttribute('aria-busy', 'false');
    document.getElementById('item-count').textContent = '';
    const description = error instanceof SyntaxError ? '文件里的文字格式需要修复。' : error.name === 'AbortError' ? '读取时间较长，请确认日报仍在运行。' : error.message;
    showMessage('日报暂时无法显示', `${description} 可以先重新读取；如果仍然失败，把这个提示告诉我，我会帮你修复。`, true);
    status.textContent = '日报读取失败。';
  }
}

desktop.addEventListener('change', () => { if (grid.getAttribute('aria-busy') === 'false' && message.hidden) render(); });
document.getElementById('clear-history').addEventListener('click', () => {
  habits = [];
  try { localStorage.removeItem(historyKey); } catch { storageAvailable = false; }
  renderRecommendations();
});
document.getElementById('retry').addEventListener('click', load);
document.getElementById('back-top').addEventListener('click', event => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
load();
