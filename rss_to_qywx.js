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
  const map = {
    '1':'贵金属','2':'黄金','3':'白银','12':'外汇','13':'欧元','14':'英镑','15':'日元','16':'美元',
    '24':'地缘','46':'中东','167':'俄乌',
    '25':'人物','47':'鲍威尔','50':'特朗普',
    '26':'央行','53':'美联储',
    '35':'经济数据'
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

/* -------------------- 关键词 -------------------- */
const WHITE_KEYS = [
  '美联储','加息','CPI','非农','通胀','利率','美元','日元',
  '黄金','原油','油价','制裁','停火','战争','特朗普','鲍威尔','今日重点'
];

const BLACK_KEYS = [
  '广告','推广','赞助','抽奖','福利','期货盯盘神器专属文章','沪金主力合约','VIP·85折',
  '沪银主力合约','金十研究员','直播','上海黄金交易所黄金T+D','上海黄金交易所白银T+D','现货黄金',
  '纽约期金日内','股价','开盘','日内涨','日内跌','期货盯盘神器'
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

      // ✅ id 去重（跨 RSS）
      if (sentIdSet.has(id)) continue;
      if (id === lastId) continue;

      let title = (it.title || '').trim();
      let text = (it.contentSnippet || '').trim();
      const time = it.pubDate || '';

      // 标题/正文完全为空
      if (!title && !text) continue;

      // 标题重复正文 → 清正文
      if (normalize(text).startsWith(normalize(title))) {
        text = '';
      }

      // 三元组去重
      const triple = tripleFingerprint(title, text, time);
      if (sentTripleSet.has(triple)) continue;

      const textAll = `${title} ${text}`;

      const hitWhite = WHITE_KEYS.some(k => textAll.includes(k));
      const hitBlack = BLACK_KEYS.some(k => textAll.includes(k));

      // 白名单优先
      if (!hitWhite && hitBlack) continue;
      if (!hitWhite && !hitBlack) continue;

      const tag = tagOf(rss);
      const linkPart = it.link ? `\n[查看原文](${it.link})` : '';

      const msg = `### ${title}
【${tag}】
${text ? text + '\n' : ''}${linkPart}${time ? `\n🕒 ${time}` : ''}`;

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
