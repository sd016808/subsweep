# SubSweep Privacy Policy

_Last updated: November 4, 2026_

[English](#english) · [繁體中文](#繁體中文)

---

## English

SubSweep ("the extension") is a browser extension that helps you clean up your YouTube subscriptions. This policy explains what data the extension handles and what it does with it. In short: **everything stays on your device, and nothing is ever sent to us or to anyone else.**

### What the extension accesses

SubSweep only runs on `www.youtube.com`, and only does something when you open its panel and start a scan or an action. To do its job it reads, from YouTube, using the account you are already signed in to in your browser:

| Data | Why |
| --- | --- |
| Your list of subscribed channels (channel ID, name, handle, avatar URL, subscriber count text) | To show your subscriptions and let you choose which ones to unsubscribe from |
| Your YouTube watch history (which channels' videos you watched, and on which day) | To show when you last watched each channel ("Not watching" filter) |
| Each subscribed channel's public upload feed / channel page | To show when each channel last uploaded ("Not uploading" filter) |
| Your YouTube session (the same session cookie YouTube's own page uses) | To sign the requests to YouTube in the same way YouTube's website does. The value is used in the page only for that purpose. It is never stored by the extension and never sent anywhere other than youtube.com |

If you choose to import a Google Takeout `watch-history.json` file, the extension reads that file locally to compute the same "last watched" information.

### What the extension stores

The following is saved in the browser's extension storage (`storage.local`), **only on your device**:

- your settings;
- the results of your last scan (subscribed channels, latest upload dates, last-watched dates and watch counts per channel);
- the list of channels you unsubscribed from with SubSweep (so you can resubscribe), and channels you chose to keep;
- a one-way hash of an internal YouTube account identifier, used only to keep data from different YouTube accounts apart.

The extension does not store your watch history itself, video titles, your name, your email address or any password.

### What the extension sends

- Requests go **only to `www.youtube.com`**, and only to read the information above or, when you ask for it, to unsubscribe from or resubscribe to channels.
- Nothing is sent to the developer of SubSweep or to any third party. SubSweep has no servers, no analytics, no tracking, no advertising and no remote code.

### Sharing and selling

We do not sell, rent, share or transfer your data to anyone. Your data is not used for advertising, credit-worthiness or any purpose other than the extension's single purpose of helping you manage your YouTube subscriptions.

### Your control

- Open SubSweep → **Settings** → **Clear all SubSweep data** to delete everything the extension has stored.
- Uninstalling the extension also deletes all of its stored data.
- Unsubscribe actions only happen after you confirm them, and you can resubscribe from the **Unsubscribed** tab.

### Children

SubSweep is not directed at children under 13 and does not knowingly collect any personal information.

### Changes

If this policy changes, the new version will be published at this address with a new "Last updated" date. Material changes will also be described in the extension's release notes.

### Contact

Questions about this policy: **[sd016808@gmail.com](mailto:sd016808@gmail.com)**

SubSweep is not affiliated with, endorsed by or sponsored by YouTube or Google. YouTube is a trademark of Google LLC.

---

## 繁體中文

SubSweep（以下稱「本擴充功能」）是一個幫你整理 YouTube 訂閱的瀏覽器擴充功能。本政策說明本擴充功能會處理哪些資料、以及如何使用。簡單來說：**所有資料都只留在你的裝置上，絕不會傳送給我們或任何其他人。**

### 本擴充功能會存取的資料

SubSweep 只在 `www.youtube.com` 上執行，而且只有在你開啟面板並開始掃描或執行操作時才會動作。為了提供功能，它會使用你在瀏覽器中已登入的帳號，向 YouTube 讀取：

| 資料 | 用途 |
| --- | --- |
| 你的訂閱頻道清單（頻道 ID、名稱、帳號代稱、頭像網址、訂閱人數文字） | 顯示你的訂閱，並讓你選擇要退訂哪些頻道 |
| 你的 YouTube 觀看紀錄（看過哪些頻道的影片、在哪一天） | 顯示你最後一次看每個頻道的時間（「很久沒看」篩選） |
| 每個訂閱頻道公開的上傳資訊／頻道頁面 | 顯示每個頻道最後一次上傳的時間（「很久沒更新」篩選） |
| 你的 YouTube 登入工作階段（與 YouTube 網頁本身使用的相同 cookie） | 以和 YouTube 網站相同的方式為送往 YouTube 的請求簽章。此數值只在頁面中用於這個目的，本擴充功能不會儲存它，也不會傳送到 youtube.com 以外的任何地方 |

如果你選擇匯入 Google Takeout 的 `watch-history.json` 檔案，本擴充功能會在本機讀取該檔案，計算相同的「最後觀看」資訊。

### 本擴充功能會儲存的資料

以下資料透過瀏覽器的擴充功能儲存空間（`storage.local`）**只儲存在你的裝置上**：

- 你的設定；
- 上次掃描的結果（訂閱頻道、各頻道最新上傳日期、最後觀看日期與觀看次數）；
- 你用 SubSweep 退訂的頻道清單（方便重新訂閱），以及你選擇保留的頻道；
- 一個 YouTube 內部帳號識別碼的單向雜湊值，只用來區分不同 YouTube 帳號的資料。

本擴充功能不會儲存你的觀看紀錄本身、影片標題、你的姓名、電子郵件或任何密碼。

### 本擴充功能會傳送的資料

- 請求**只會送往 `www.youtube.com`**，而且只用於讀取上述資訊，或在你要求時退訂、重新訂閱頻道。
- 不會傳送任何資料給 SubSweep 的開發者或任何第三方。SubSweep 沒有伺服器、沒有統計分析、沒有追蹤、沒有廣告，也不會載入遠端程式碼。

### 分享與販售

我們不會販售、出租、分享或轉移你的資料給任何人。你的資料不會用於廣告、信用評估，或「協助你管理 YouTube 訂閱」以外的任何用途。

### 你的控制權

- 開啟 SubSweep →「設定」→「清除所有 SubSweep 資料」，即可刪除本擴充功能儲存的所有資料。
- 移除本擴充功能也會一併刪除它儲存的所有資料。
- 退訂動作一定要經過你確認才會執行，而且你可以在「已退訂」分頁重新訂閱。

### 兒童

SubSweep 並非以 13 歲以下兒童為對象，也不會在知情的情況下收集任何個人資訊。

### 政策變更

如果本政策有所變更，新版本會發布在相同網址並更新「最後更新」日期。重大變更也會在擴充功能的版本說明中註明。

### 聯絡方式

對本政策有任何疑問：**[sd016808@gmail.com](mailto:sd016808@gmail.com)**

SubSweep 與 YouTube 或 Google 沒有任何關係，也未獲得其認可或贊助。YouTube 是 Google LLC 的商標。
