# SubSweep 上架指南（Chrome 線上應用程式商店）

這份文件一步一步帶你把 SubSweep 上架。需要貼到後台的文字都已經準備好了；**英文區塊請直接複製貼上**，審核人員看英文最快。

> 上架前請務必先完成 [README](../README.md#上架前一定要做的手動測試) 裡的「手動測試」。登入後才能用的功能（讀取訂閱、觀看紀錄、退訂）只能用你自己的帳號實際測試。

---

## 0. 上架前檢查清單

- [ ] 用自己的 YouTube 帳號跑完 README 的手動測試，全部正常
- [ ] `PRIVACY.md` 裡的 **[your contact email]／[你的聯絡信箱]** 已換成你的信箱
- [ ] 隱私權政策已放到公開網址（見第 3 步）
- [ ] 版本號正確（`extension/manifest.json` 的 `version`）
- [ ] 執行 `npm run assets` 重新產生圖示和截圖（UI 有改過時）
- [ ] 執行 `npm run package` 產生 `dist/subsweep-<版本>.zip`

---

## 1. 註冊開發者帳號（只需一次）

1. 前往 <https://chrome.google.com/webstore/devconsole>，用你要當「開發者」的 Google 帳號登入。
   - 建議用專門的帳號：**帳號建立後就不能更換 email**。
2. 同意開發者協議，支付**一次性註冊費**（目前為 5 美元，以頁面顯示為準）。
3. 在「Account（帳戶）」頁面填寫：
   - **Publisher name**（發布者名稱）：商店上會顯示的名稱，例如你的名字或工作室名稱。
   - **Contact email**：需要驗證。
   - **Trader / Non-trader 聲明**：個人開發、不收費的話通常選 **Non-trader（非交易者）**。如果之後要收費或以公司名義經營，再改成 Trader。
4. 建議幫這個 Google 帳號開啟兩步驟驗證。

---

## 2. 上傳套件

1. 在專案根目錄執行：
   ```
   npm run package
   ```
   會先跑語法檢查和全部測試，通過後產生 `dist/subsweep-1.0.0.zip`。
2. Developer Dashboard →「**New item（新增項目）**」→ 上傳這個 zip。

---

## 3. 準備隱私權政策網址

商店要求一個**公開**的隱私權政策網址。內容已經寫好在 [`PRIVACY.md`](../PRIVACY.md)（英文＋繁中）。任選一種方式放上網：

- **GitHub**：把專案推到公開 repo，直接使用 `PRIVACY.md` 的網址；或開 GitHub Pages。
- **Google 協作平台（Google Sites）**：新增一個頁面，把 `PRIVACY.md` 的內容貼上，發布。
- 你自己的網站。

> 填之前記得把 `[your contact email]` 換成真正的聯絡信箱。

---

## 4.「Store listing（商店資訊）」分頁

| 欄位 | 填什麼 |
| --- | --- |
| Description（說明） | 每個語言貼 `store/listing/<語言>.md` 裡的「說明」區塊 |
| Category（類別） | 建議 **Productivity → Tools（工具）**；沒有的話選 **Make Chrome Yours → Functionality & UI** |
| Language（語言） | 預設 English。後台會自動偵測 `_locales` 裡的 5 種語言，切換語言即可分別填寫說明、上傳截圖 |
| Store icon | `store/assets/icon-128.png` |
| Screenshots | `store/assets/<語言>/screenshot-1 ~ 5`（1280×800），依編號順序上傳 |
| Small promo tile | `store/assets/<語言>/promo-small-440x280.png`（選填，但有的話排序較前面） |
| Marquee promo tile | `store/assets/<語言>/marquee-1400x560.png`（選填，被精選時才會用到） |
| Official URL / Homepage | 有 GitHub repo 或網站就填，沒有可空白 |
| Support URL | 建議填 GitHub Issues 或聯絡表單 |

名稱和摘要會**自動**從 `_locales/*/messages.json` 的 `extName`、`extDescription` 帶入，不用另外填。

---

## 5.「Privacy（隱私權）」分頁 — 直接複製貼上

### Single purpose（單一用途）

```
SubSweep helps users clean up their YouTube subscriptions. It lists the channels the user is subscribed to, shows which ones have stopped uploading or have not been watched recently, and lets the user unsubscribe from (and resubscribe to) the channels they select.
```

### Permission justification（權限說明）

**storage**
```
Stores the user's settings and scan results (subscribed channels, latest upload dates, last-watched dates), the channels the user chose to keep, and the list of channels unsubscribed with SubSweep so the user can undo. Everything is kept locally with chrome.storage.local; nothing is synced or sent anywhere.
```

**scripting**
```
Used only when the user clicks the SubSweep toolbar button and a www.youtube.com tab is already open that does not yet have SubSweep in it (it was opened before SubSweep was installed or updated). SubSweep then injects its own packaged content scripts — the same files listed in the manifest, no remote code — into that YouTube tab, so its panel can open without reloading the page.
```

**Host permission: https://www.youtube.com/\***
```
SubSweep only works on YouTube and does not run on any other site. On www.youtube.com it shows its panel and, using the user's existing signed-in session, makes the same requests YouTube's own website makes to: read the user's subscription list and watch history, read each subscribed channel's public upload feed, and unsubscribe from or resubscribe to channels when the user explicitly confirms. All requests go only to www.youtube.com.
```

### Remote code（遠端程式碼）

選 **「No, I am not using remote code」**。（所有程式碼都包在套件內，沒有載入任何外部腳本。）

### Data usage（資料使用）— 要勾的項目

| 類別 | 勾選？ | 原因 |
| --- | --- | --- |
| Personally identifiable information | 不勾 | 不讀取姓名、email 等。帳號只用單向雜湊值區分 |
| Health information | 不勾 | |
| Financial and payment information | 不勾 | |
| **Authentication information** | **建議勾** | bridge 會讀取 YouTube 頁面的登入 cookie 來替請求簽章（和 YouTube 網頁本身的做法一樣），雖然只在頁面中使用、不儲存也不外傳，誠實揭露比較不會在審核時被認為隱瞞 |
| Personal communications | 不勾 | |
| Location | 不勾 | |
| **Web history** | **勾** | 讀取 YouTube 觀看紀錄來計算「最後觀看」 |
| User activity | 不勾 | 不監控點擊、按鍵、捲動 |
| **Website content** | **勾** | 讀取訂閱清單、頻道名稱、頭像、上傳日期 |

三個聲明（certification）**全部勾選**：
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL

填第 3 步準備好的網址。

---

## 6. 給審核人員的測試說明

如果後台有「Test instructions」之類的欄位（或審核人員來信詢問），貼這段：

```
1. Sign in to https://www.youtube.com with any Google account that has a few channel subscriptions.
2. Click the SubSweep toolbar icon. A panel opens on top of the YouTube page.
3. Click "Start scan". SubSweep reads the subscription list, the watch history and each channel's latest upload (about 1 minute for 100 channels).
4. Use the filter chips ("Not uploading", "Not watching") and the period selectors to see suggestions.
5. Tick one channel and click "Unsubscribe", then confirm. The channel is unsubscribed on YouTube.
6. Open the "Unsubscribed" tab and click "Resubscribe" to undo.
No account, server or payment is involved; all data stays in chrome.storage.local.
```

---

## 7.「Distribution（發布）」分頁

- **Visibility**：Public（公開）。想先給朋友測試可以選 **Unlisted（不公開，知道連結的人可安裝）**。
- **Regions**：All regions。
- 價格：免費。

全部填好後按右上角 **「Submit for review（提交審核）」**。審核通常需要幾天；SubSweep 只要求 youtube.com 一個網域的權限，屬於較單純的審核類型。

---

## 8. 之後要更新版本

1. 修改程式碼，記得一併更新翻譯（`npm test` 會檢查 5 種語言的 key 是否一致）。
2. 把 `extension/manifest.json` 的 `version` 加一，例如 `1.0.0` → `1.0.1`（**每次上傳都必須比上一版大**）。
3. 在 `CHANGELOG.md` 記錄變更。
4. UI 有變的話執行 `npm run assets` 更新截圖。
5. `npm run package` → 在後台「Package」分頁上傳新的 zip → 提交審核。

---

## 9. 同時上架 Microsoft Edge（免費）

同一個 zip 可以直接上架 Edge 附加元件商店：

1. 到 <https://partner.microsoft.com/dashboard/microsoftedge> 註冊（免費）。
2. 上傳 `dist/subsweep-<版本>.zip`。
3. 商店說明、截圖、隱私權政策都可以沿用本資料夾的檔案。

---

## 10. 審核可能遇到的問題與對策

| 情況 | 對策 |
| --- | --- |
| 被要求說明為什麼需要 youtube.com 權限 | 引用第 5 步的權限說明；強調只在 youtube.com 執行、所有請求只送往 youtube.com |
| 被質疑名稱使用 YouTube 商標 | 名稱採用「SubSweep – Subscription Cleaner for YouTube」這種「for YouTube」寫法：品牌是 SubSweep，YouTube 只說明適用平台、不放在名稱開頭，是 YouTube 品牌規範比較認可的方式；其他語言的名稱也都是「適用於 YouTube」的意思。說明中有「與 YouTube／Google 無關」的聲明，圖示和截圖也都沒用 YouTube 標誌。如果仍被質疑，把以上說明回覆給審查員 |
| 被要求補充資料使用揭露 | 確認第 5 步的勾選和 `PRIVACY.md` 內容一致 |
| 「功能與說明不符」 | 確認截圖和說明是最新版本（`npm run assets` 重新產生） |

> 補充：SubSweep 使用 YouTube 網頁本身的內部請求，而不是官方 API。這在商店政策上沒有問題（許多類似插件都是這樣做），但 YouTube 改版時可能需要更新插件。另外，嚴格來說這屬於 YouTube 服務條款中「自動化存取」的灰色地帶，這一點我們在一開始討論時就提過了。
