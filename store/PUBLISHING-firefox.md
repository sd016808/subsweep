# SubSweep 上架指南（Firefox Add-ons）

Firefox 版和 Chrome 版是**同一份程式碼**，只有 manifest 不同；`npm run package` 會自動產生 Firefox 用的 manifest 和 zip。商店說明、截圖、隱私權政策都和 Chrome 共用。

- 上架 Firefox Add-ons（addons.mozilla.org，簡稱 AMO）**免費**，沒有註冊費。
- Firefox 只能安裝經過 Mozilla 簽署的附加元件，所以就算只想給幾個朋友用，也要上傳到 AMO 讓 Mozilla 簽署（見第 2 步的「自行發布」）。
- **英文區塊請直接複製貼上。**

---

## 0. 上架前檢查清單

- [ ] 在 Firefox 跑完 [README](../README.md#上架前一定要做的手動測試) 手動測試的第 6 項（Firefox）
- [ ] 隱私權政策網址 <https://sd016808.github.io/subsweep-privacy/> 打得開
- [ ] 版本號正確（和 Chrome 共用 `extension/manifest.json` 的 `version`）
- [ ] 執行 `npm run package` 產生 `dist/subsweep-firefox-<版本>.zip`

---

## 1. 註冊開發者帳號（只需一次，免費）

1. 前往 <https://addons.mozilla.org/developers/>，按頁面右上角「**Register**」註冊 Mozilla 帳號（有帳號就按「Log in」）。
2. **開啟兩步驟驗證（必要）**：Mozilla 規定上架附加元件的帳號一定要開啟兩步驟驗證，沒開的話登入時會被導到帳號設定頁要求開啟。
   - 手機先裝一個驗證器 App，例如 Google Authenticator 或 Microsoft Authenticator，掃描畫面上的 QR code。
   - **一定要把「復原碼（recovery codes）」存好**（印出來或存在密碼管理器）。手機遺失又沒有復原碼的話，Mozilla 無法幫你救回帳號，附加元件也就再也不能更新。
3. 第一次提交時，依畫面指示同意開發者協議，並設定開發者顯示名稱（會顯示在商店頁面上）。

---

## 2. 選擇發布方式

上傳時會先問「How to Distribute this Version」：

| 選項 | 說明 | 建議 |
| --- | --- | --- |
| **On this site**（在 addons.mozilla.org 公開） | 使用者在 AMO 搜尋、一鍵安裝，之後**自動更新** | ✅ 正式上架選這個 |
| **On your own**（自行發布） | Mozilla 簽署後給你一個 `.xpi` 檔，你自己傳給使用者，使用者把檔案拖進 Firefox 視窗就能安裝；**不會自動更新**，每次改版都要重新傳檔案 | 只給少數人測試時用 |

---

## 3. 上傳套件

1. Developer Hub →「**Submit Your First Add-on**」（之後是「Submit a New Add-on」）→ 選第 2 步的發布方式 →「Continue」。
2. 按「Select a file」上傳 `dist/subsweep-firefox-<版本>.zip`（注意是 **firefox** 的 zip，不是 chrome 的）。
3. 相容平台：勾 **Firefox**（電腦版），**不要勾 Firefox for Android**。手機上的 YouTube 是另一個網站（m.youtube.com），SubSweep 目前還不支援。
4. 自動檢查結果應該是 **0 個錯誤、0 個警告**。如果出現「"strict_min_version" requires Firefox for Android 140…」的警告，代表上傳的是 1.0.0 的舊 zip，請重新執行 `npm run package`。
5. 「**Do you need to submit source code?**」→ 選 **No**。SubSweep 沒有經過壓縮、打包或轉譯，上傳的檔案就是原始碼。

---

## 4. 商店資訊（Describe Add-on）

| 欄位 | 填什麼 |
| --- | --- |
| Name（名稱） | **自動**從 manifest 帶入：SubSweep – Subscription Cleaner for YouTube（AMO 名稱上限 50 字，沒有超過） |
| Add-on URL | 建議 `subsweep`，商店網址會是 `https://addons.mozilla.org/firefox/addon/subsweep/`（被用走的話改 `subsweep-youtube`） |
| Summary（摘要） | **自動**從 manifest 帶入 |
| Description（說明） | 貼 [`listing/en.md`](listing/en.md) 的「Description」區塊 |
| Experimental（實驗性） | **不要勾**（勾了會降低曝光） |
| Payment（需要付費） | **不要勾**（SubSweep 完全免費） |
| Categories（類別） | Firefox 類別最多選 2 個：**Photos, Music & Videos**（相片、音樂與影片），第二個可選 **Social & Communication**。Android 類別不用選 |
| Support email | `sd016808@gmail.com` |
| Support website | 可空白 |
| License（授權） | 不打算開源就選 **All Rights Reserved**；想開源可選 MIT |
| Privacy Policy | 勾選「This add-on has a Privacy Policy」，貼上 [`PRIVACY.md`](../PRIVACY.md) 的英文部分（AMO 這一欄是貼文字，不是填網址） |
| Notes to Reviewer | 貼第 5 步的英文 |

**其他語言**：名稱和摘要會自動從 `_locales` 帶入 5 種語言。說明要在商店資訊頁上方切換語言（Manage localizations / 語言選單）後，分別貼 [`listing/`](listing/) 裡各語言的「說明」區塊。

**截圖**：上傳完成後，到附加元件的「Edit Product Page」→「Images」上傳 `store/assets/<語言>/screenshot-1 ~ 5`。圖示會自動使用 manifest 裡的圖示。

**資料收集**：Firefox 版的 manifest 已經聲明「**不收集任何資料**」（`data_collection_permissions: none`），商店頁和安裝畫面會自動顯示，不用另外填。

---

## 5. 給審查員的說明（Notes to Reviewer）— 直接複製貼上

```
SubSweep helps users clean up their YouTube subscriptions: it lists the channels the user is subscribed to, shows which ones have stopped uploading or have not been watched recently, and lets the user unsubscribe from (and resubscribe to) the channels they select.

HOW TO TEST
1. Sign in to https://www.youtube.com with any Google account that has a few channel subscriptions.
2. Click the SubSweep toolbar button (in the Extensions menu if it is not pinned). A panel opens on top of the YouTube page.
3. Click "Start scan". SubSweep reads the subscription list, the watch history and each channel's latest upload (about 1 minute for 100 channels).
4. Use the filter chips ("Not uploading", "Not watching") and the period selectors to see suggestions.
5. Tick one channel and click "Unsubscribe", then confirm. The channel is unsubscribed on YouTube.
6. Open the "Unsubscribed" tab and click "Resubscribe" to undo.

TECHNICAL NOTES
- No remote code, no minification, no bundler or transpiler: the uploaded files are the source code.
- Runs only on www.youtube.com (the only host permission). All requests go only to www.youtube.com.
- src/bridge.js runs in the page's MAIN world. It forwards an allow-list of three YouTube endpoints (browse, subscription/subscribe, subscription/unsubscribe) using the page's own signed-in session, the same requests YouTube's web app makes. It reads the SAPISID cookie only to compute the same SAPISIDHASH request signature YouTube's own page attaches; the value is never stored and never sent anywhere other than www.youtube.com.
- "scripting" is used only when the user clicks the toolbar button and an already-open YouTube tab does not have SubSweep yet; it injects the packaged content scripts (the files listed in the manifest).
- "storage": settings and scan results are kept locally in storage.local. Nothing is sent to the developer or any third party (data_collection_permissions: none). No analytics, no ads, no servers.
```

---

## 6. 送出與審核

按「Submit Version」送出，會看到「Version Submitted」頁面並收到確認信。

- 選「On this site」：通過自動檢查、Mozilla 簽署後就會上架，通常很快。Mozilla 之後仍可能人工審查；如果有問題，會寄信到你的帳號信箱說明要修改的地方。
- 選「On your own」：簽署完成後，在 Developer Hub 的版本頁面下載 `.xpi`，傳給使用者安裝。

---

## 7. 之後要更新版本

1. 修改程式碼，把 `extension/manifest.json` 的 `version` 加一（Chrome 和 Firefox 共用版本號，**每次上傳都必須比上一版大**）。
2. 執行 `npm run package`，會同時產生 Chrome 和 Firefox 的 zip。
3. Developer Hub →「My Add-ons」→ SubSweep →「**Upload New Version**」→ 上傳 `dist/subsweep-firefox-<版本>.zip`。

### 商店審核期間先給朋友用

1. 把 `extension/manifest.json` 的 `version` 加一。**AMO 上每個版本號只能用一次，公開版和自行發布版共用**，所以不能和審核中的版本相同。
2. `npm run package` → Developer Hub →「Upload New Version」→ 選「**On your own**」→ 上傳 Firefox 的 zip。
3. 自動檢查通過就會簽署（通常幾分鐘，不用等人工審核），到版本頁面下載 `.xpi` 傳給朋友。朋友把它拖進 Firefox 視窗就能安裝，重開也不會消失，但**不會自動更新**。
4. 下次公開發布的版本號要比這個自行發布版大，例如審核中 1.0.0、自行發布 1.0.1，下一個公開版就用 1.0.2。附加元件 ID 相同，所以等商店上的版本比較新時，朋友從商店安裝會直接升級，資料保留。

---

## 8. 重要：附加元件 ID 不能改

Firefox 版的附加元件 ID 是 `subsweep@sd016808.github.io`，設定在 [`tools/lib/targets.mjs`](../tools/lib/targets.mjs)。Firefox 用這個 ID 辨認「同一個附加元件的新版本」，**第一次上傳之後就不能再改**，否則會被當成另一個附加元件，已安裝的使用者也收不到更新。

---

## 9. 審核可能遇到的問題與對策

| 情況 | 對策 |
| --- | --- |
| 詢問為什麼讀取 cookie、在頁面環境（MAIN world）執行程式 | 回覆第 5 步「TECHNICAL NOTES」的第 3 點：只用來產生和 YouTube 網頁本身相同的請求簽章，不儲存、不外傳，只允許 3 個固定的 YouTube 端點 |
| 質疑名稱使用 YouTube 商標 | 名稱是「SubSweep – Subscription Cleaner for YouTube」的「for YouTube」寫法：品牌是 SubSweep，YouTube 只說明適用的網站。說明中也聲明與 YouTube／Google 無關 |
| 要求提供原始碼 | 回覆上傳的檔案本身就是未經處理的原始碼（沒有壓縮、打包或轉譯） |
| 要求在 Android 上測試 | 回覆目前只支援 Firefox 電腦版，並確認上傳時沒有勾選 Android |
| 上傳時出現「Duplicate add-on ID found／發現重複的附加元件 ID」 | 你是從「Submit a New Add-on」上傳的，那是建立**另一個**附加元件用的。新版本要從 My Add-ons → SubSweep →「**Upload New Version**」上傳，公開版和自行發布版都一樣 |
