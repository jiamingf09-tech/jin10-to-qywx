const Parser = require('rss-parser');
const axios = require('axios');
const fs = require('fs');

const RSS_ENV = process.env.RSS_URL;
const WEBHOOK = process.env.QYWX_WEBHOOK;
const STORE = 'last.json';

const RSS_LIST = RSS_ENV.split('\n').map(i => i.trim()).filter(Boolean);
const parser = new Parser({ timeout: 15000 });

/* -------------------- 读取历史（兼容旧版本） -------------------- */
let history = {};
if (fs.existsSync(STORE)) {
  history = JSON.parse(fs.readFileSync(STORE, 'utf8'));
}

const sentIdSet = new Set(history.__IDS__ || history.__ALL__ || []);
const sentTripleSet = new Set(history.__TRIPLES__ || []);

/* -------------------- 分类标签 -------------------- */
function tagOf(url){
  if (url.includes('/important')) return '金十·重要快讯';
  const map = { '1':'贵金属','2':'黄金','3':'白银','12':'外汇','13':'欧元','14':'英镑','15':'日元','16':'美元','17':'瑞郎','18':'人民币',
                '24':'地缘','44':'缅甸','45':'印巴','46':'中东','155':'阿富汗','167':'俄乌',
                '25':'人物','47':'鲍威尔','49':'拉加德','50':'特朗普','51':'拜登','157':'巴菲特',
                '26':'央行','53':'美联储','54':'中行','55':'欧央行','56':'日央行','137':'货币政策',
                '141':'英央','159':'澳联','160':'新西兰','161':'加央','112':'高盛','72':'美银','71':'三大评级',
                '34':'政策','33':'债券','75':'中国','76':'美国','77':'欧盟','78':'日本','79':'关税',
                '81':'香港','120':'英国','35':'经济数据','38':'灾害','96':'地震','97':'爆炸',
                '98':'海啸','99':'寒潮','100':'洪涝','101':'火灾','102':'矿难','103':'枪击'
              };
  const m = url.match(/category\/(\d+)/);
  return m && map[m[1]] ? `金十·${map[m[1]]}` : '金十';
}

/* -------------------- 归一化 -------------------- */
function normalize(t='') {
  return t.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g,'').toLowerCase();
}

/* -------------------- 指纹 -------------------- */
function idFingerprint(it) {
  return it.link || it.guid || normalize((it.title||'') + (it.pubDate||''));
}

function tripleFingerprint(title, text, time) {
  return normalize(`${title}|${text}|${time}`);
}

/* -------------------- 强力 Markdown 判空（终极兜底） -------------------- */
function isMeaningfulMarkdown(md = '') {
  if (!md) return false;

  const stripped = md
    // 去 markdown 结构
    .replace(/[#>*_\-\n\r]/g, '')
    // 去链接壳，保留文字
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    // 去 emoji / 时间符号
    .replace(/🕒/g, '')
    // 去空白
    .replace(/\s+/g, '');

  // 过短 → 无意义
  if (stripped.length < 6) return false;

  // 纯数字 / 时间
  if (/^[0-9:.\-]+$/.test(stripped)) return false;

  return true;
}

/* -------------------- 关键词 -------------------- */
const WHITE_KEYS = [
  '美联储','加息','CPI','非农','通胀','利率','美元','日元',
  '黄金','原油','油价','制裁','停火','战争','特朗普','鲍威尔','今日重点'
];

const BLACK_KEYS = [
  '广告','推广','赞助','抽奖','福利','期货盯盘神器专属文章','沪金主力合约','VIP·85折',
  '沪银主力合约','金十研究员','直播','上海黄金交易所黄金T+D','上海黄金交易所白银T+D',
  '现货黄金','纽约期金日内','股价','开盘','日内涨','日内跌','期货盯盘神器'
];

(async () => {
  let total = 0;

  for (const rss of RSS_LIST) {
    let feed;
    try {
      console.log('Fetching:', rss);
      feed = await parser.parseURL(rss);
    } catch (e) {
      console.error('❌ RSS失败：', rss, e.message);
      continue;
    }

    const items = (feed.items || []).reverse();
    const lastId = history[rss] || null;
    let newestId = lastId;

    for (const it of items) {
      const id = idFingerprint(it);
      if (!id) continue;

      // ID 去重
      if (sentIdSet.has(id)) continue;
      if (id === lastId) continue;

      let title = (it.title || '').trim();
      let text  = (it.contentSnippet || '').trim();
      const time = it.pubDate || '';

      // 标题 + 正文都空
      if (!title && !text) continue;

      // 伪正文（只有符号 / 很短）
      if (text && normalize(text).length < 4) {
        text = '';
      }

      // 标题 ≈ 正文 → 清正文
      if (text && normalize(text).startsWith(normalize(title))) {
        text = '';
      }

      // 三元组去重
      const triple = tripleFingerprint(title, text, time);
      if (sentTripleSet.has(triple)) continue;

      const textAll = `${title} ${text}`;

      const hitWhite = WHITE_KEYS.some(k => textAll.includes(k));
      const hitBlack = BLACK_KEYS.some(k => textAll.includes(k));

      // 黑名单最高优先级
      if (hitBlack) continue;
      // 未命中白名单
      if (!hitWhite) continue;

      const tag = tagOf(rss);
      const linkPart = it.link ? `\n[查看原文](${it.link})` : '';

      const msg = `### ${title}
【${tag}】
${text ? text + '\n' : ''}${linkPart}${time ? `\n🕒 ${time}` : ''}`;

      // 🚫🚫🚫 终极拦截点：企业微信“空白卡片”杀手
      if (!isMeaningfulMarkdown(msg)) {
        console.log('⛔ 跳过空白/伪空白消息:', title || '[no-title]');
        continue;
      }

      try {
        await axios.post(WEBHOOK, {
          msgtype: 'markdown',
          markdown: { content: msg }
        });
        sentIdSet.add(id);
        sentTripleSet.add(triple);
        newestId = id;
        total++;
      } catch (e) {
        console.error('❌ 推送失败：', e.message);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    if (newestId) history[rss] = newestId;
  }

  /* -------------------- 写回（限制体积） -------------------- */
  history.__IDS__ = Array.from(sentIdSet).slice(-10000);
  history.__TRIPLES__ = Array.from(sentTripleSet).slice(-10000);

  fs.writeFileSync(STORE, JSON.stringify(history, null, 2));
  console.log(`完成，成功发送 ${total} 条`);
})();
