// Narration of the promo video (繁體中文). Each line is one voice clip and one subtitle;
// `show` overrides the subtitle text (default: the spoken text without trailing punctuation).
// The scene ids match the scenes in tools/video/stage.js.
export default {
  locale: 'zh_TW',
  title: 'SubSweep – 一次清掉沒在看的 YouTube 訂閱',
  scenes: [
    { id: 'hook', lines: [{ say: '訂閱了幾百個頻道，' }, { say: '真正會看的卻沒幾個？' }] },
    { id: 'problem', lines: [{ say: '想整理，卻只能一個一個退訂？' }] },
    { id: 'intro', lines: [{ say: '試試 SubSweep，' }, { say: '免費的 YouTube 訂閱清理工具。' }] },
    { id: 'open', lines: [{ say: '點一下工具列上的 SubSweep，' }, { say: '按「開始掃描」。' }] },
    { id: 'scan', lines: [{ say: '它會讀取你的訂閱和觀看紀錄，' }, { say: '還有每個頻道最後上傳的時間。' }] },
    { id: 'results', lines: [{ say: '多久沒更新、多久沒看，一目了然。' }] },
    {
      id: 'filters',
      lines: [
        { say: '「很久沒更新」，找出停更的頻道；' },
        { say: '「很久沒看」，找出你不再看的頻道；' },
        { say: '預設的「建議清理」，符合一種就會列出。' },
        { say: '月數也能自己調整。' },
      ],
    },
    { id: 'unsub', lines: [{ say: '勾選頻道，按「退訂」，' }, { say: '確認後就會一次退訂。' }] },
    { id: 'undo', lines: [{ say: '退錯了也沒關係，' }, { say: '在「已退訂」一鍵就能重新訂閱。' }] },
    {
      id: 'privacy',
      lines: [{ say: '完全免費，沒有廣告；' }, { say: '沒有伺服器，資料只存在你的瀏覽器；' }, { say: '也不用輸入帳號密碼。' }],
    },
    { id: 'cta', lines: [{ say: '到 Chrome 線上應用程式商店，搜尋 SubSweep。' }, { say: 'Edge 和 Brave 也能用，連結在說明欄。' }] },
  ],
  // Text on the title cards.
  cards: {
    hookCount: '訂閱中 · 312 個頻道',
    problemTitle: '只能一個一個退訂…',
    problemUnit: '已退訂',
    problemTotal: 312,
    subscribed: '已訂閱',
    subscribe: '訂閱',
    privacy: [
      { icon: 'gift', title: '完全免費', body: '沒有廣告、沒有付費功能' },
      { icon: 'serverOff', title: '沒有伺服器', body: '資料只存在你的瀏覽器' },
      { icon: 'key', title: '不用帳號密碼', body: '直接使用你登入的 YouTube' },
    ],
    ctaStore: 'Chrome 線上應用程式商店',
    ctaSearch: 'SubSweep',
    ctaBrowsers: ['Chrome', 'Edge', 'Brave'],
    ctaLink: '連結在影片說明欄',
    notAffiliated: '本工具與 YouTube、Google 無關',
    // The YouTube thumbnail (dist/video/…-thumbnail.jpg).
    thumb: { lines: ['一次清掉', '沒在看的', 'YouTube 訂閱'], accent: 1, tag: '免費 · 不用帳號密碼 · 資料不外傳' },
  },
};
