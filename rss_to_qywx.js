const Parser = require('rss-parser');
const axios = require('axios');
const fs = require('fs');

const RSS_ENV = process.env.RSS_URL;
const WEBHOOK = process.env.QYWX_WEBHOOK;
const STORE = 'last.json';

const RSS_LIST = RSS_ENV.split('\n').map(i => i.trim()).filter(Boolean);
const parser = new Parser({ timeout: 15000 });

// 读历史
let history = {};
if (fs.existsSync(STORE)) history = JSON.parse(fs.readFileSync(STORE,'utf8'));

// 全局已发送集合（终极防重）
let sentSet = new Set(history.__ALL__ || []);

// 标签
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

// 归一化（用于标题/正文去重）
function normalize(t='') {
  return t.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g,'').toLowerCase();
}

(async () => {
  let total = 0;

  for (const rss of RSS_LIST) {
    let feed;
    try {
      console.log('Fetching:', rss);
      feed = await parser.parseURL(rss);
    } catch (e) {
      console.error('❌ RSS失败，已跳过：', rss, e.message);
      continue; // 单源容错
    }

    // 反转，保证旧→新
    const items = (feed.items || []).reverse();

    // 断点续推
    const last = history[rss] || '';
    let newest = last;

    for (const it of items) {
      if (!it.link) continue;

      // ✅ 终极防重（任何曾发过的 link 直接跳过）
      if (sentSet.has(it.link)) continue;

      // ✅ 断点续推（容忍乱序：遇到 last 只是不更新 newest，不影响 sentSet 防重）
      if (it.link === last) continue;

      const title = (it.title || '').trim();
      let text = (it.contentSnippet || '').trim();
      const time = it.pubDate || '';
      const tag = tagOf(rss);

      // 标题/正文重复 → 清掉正文
      if (normalize(text).startsWith(normalize(title))) text = '';

      // ✅ 仅对【重要快讯】做关键词过滤
      if (tag === '金十·重要快讯') {
        const KEYS = ['美联储','加息','CPI','非农','通胀','利率','美元','日元','黄金','油','制裁','停火','战争','特朗普','鲍威尔'];
        const textAll = `${title} ${text}`;
        if (!KEYS.some(k => textAll.includes(k))) continue;
      }

      const msg = `### ${title}
【${tag}】
${text ? text + '\n' : ''}
[查看原文](${it.link})${time ? `\n🕒 ${time}` : ''}`;

      try {
        await axios.post(WEBHOOK, { msgtype:'markdown', markdown:{content: msg}});
        // 记录防重
        sentSet.add(it.link);
        newest = it.link;
        total++;
      } catch (e) {
        console.error('❌ 推送失败：', e.message);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    if (newest) history[rss] = newest;
  }

  // 只保留最近 1000 条指纹，防止文件无限增大
  history.__ALL__ = Array.from(sentSet).slice(-1000);

  fs.writeFileSync(STORE, JSON.stringify(history,null,2));
  console.log(`完成，成功发送 ${total} 条`);
})();
