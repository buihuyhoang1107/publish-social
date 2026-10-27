# SOCIAL PUBLISHER - TELEGRAM + N8N

> Tai lieu cau hinh goc de giao cho Codex.  
> Muc tieu: xay dung he thong dang noi dung thiep online tu mot noi duy nhat (Telegram) va phan phoi sang nhieu nen tang mang xa hoi bang n8n self-hosted.

---

## 1. Muc tieu he thong

He thong phuc vu dich vu thiep online:

- Thiep cuoi
- Sinh nhat
- Thoi noi / day thang
- Tan gia
- Tat nien
- Mung tho
- Su kien khac

Flow tong quat:

```text
Telegram
  -> Nhap text / anh / video
  -> Preview
  -> Approve
  -> n8n
  -> Facebook
  -> Instagram
  -> Threads
  -> TikTok Draft
```

Muc tieu kinh doanh:

```text
Content
  -> View
  -> Comment / Inbox
  -> Xem mau
  -> Lead
  -> Dat thiep
```

Khong toi uu chi theo luot xem.

---

## 2. Nguyen tac kien truc

V1 KHONG can:

```text
React
Next.js
NestJS
PostgreSQL
Redis
Kafka
Kubernetes
Cloud Server
```

V1 su dung:

```text
Telegram Bot
+ n8n self-hosted
+ Docker
+ Cloudflare Tunnel
+ SQLite mac dinh cua n8n
```

Vai tro:

```text
Telegram = CONTROL CENTER
n8n      = WORKFLOW ENGINE
Social   = PUBLISHER ADAPTERS
```

Khong dung mot social platform lam master source. Tat ca phai di qua mot Master Post trung gian.

---

## 3. Kien truc tong the

```text
                        USER
                         |
                         v
                 +----------------+
                 | TELEGRAM BOT   |
                 | Text/Image/Video|
                 +-------+--------+
                         |
                         v
                 +----------------+
                 |      n8n       |
                 | Local Workflow |
                 +-------+--------+
                         |
                  Build Master Post
                         |
                         v
                     PREVIEW
                         |
                      APPROVE
                         |
              +----------+----------+
              |          |          |
              v          v          v
          Facebook   Instagram   Threads
                                      |
                                      v
                                   TikTok
                                   Draft
```

---

## 4. Content taxonomy

### Service Type

```text
WEDDING        = Thiep cuoi
BIRTHDAY       = Sinh nhat
BABY           = Thoi noi / day thang
HOUSE_WARMING  = Tan gia
YEAR_END       = Tat nien
LONGEVITY      = Mung tho
EVENT          = Su kien khac
```

### Content Type

```text
DEMO
PROBLEM
FEATURE
EDUCATION
INSPIRATION
SALE
VIRAL
TUTORIAL
COMPARISON
```

Vi du WEDDING:

```text
DEMO        - Mot chiec thiep cuoi online trong nhu the nao?
PROBLEM     - Khach o xa thi gui thiep sao?
FEATURE     - Google Maps ngay tren thiep
EDUCATION   - 5 thong tin thiep cuoi nhat dinh phai co
INSPIRATION - Mau thiep tone champagne
SALE        - Nhan thiet ke thiep cuoi online
TUTORIAL    - Cach gui thiep qua Zalo
COMPARISON  - Thiep giay vs thiep online
```

---

## 5. Cong thuc noi dung

Moi bai nen theo:

```text
HOOK
 -> PROBLEM / CURIOSITY
 -> SOLUTION
 -> BENEFIT
 -> CTA
```

Vi du:

```text
HOOK
Thiep cuoi bay gio dau nhat thiet phai phat tung tam?

PROBLEM
Khach o xa, ban be nhieu tinh, gui thiep giay rat bat tien.

SOLUTION
Thiep online co the gui qua Zalo, Messenger hoac link.

BENEFIT
Khach xem duoc thoi gian, Google Maps, RSVP, album anh, QR mung cuoi.

CTA
Nhan "MAU" de xem demo.
```

---

## 6. Master Post

Moi bai dang phai duoc chuan hoa ve mot object trung gian:

```json
{
  "service": "WEDDING",
  "topic": "Google Maps tren thiep cuoi",
  "contentType": "FEATURE",
  "goal": "LEAD",
  "hook": "Khach moi tim nha hang cuoi khong ra?",
  "content": "Thiep cuoi online giup khach mo Google Maps chi voi mot lan cham.",
  "cta": "Nhan MAU de xem demo.",
  "mediaType": "VIDEO",
  "mediaPath": "video.mp4",
  "platforms": ["FACEBOOK", "INSTAGRAM", "THREADS", "TIKTOK"],
  "status": "DRAFT"
}
```

Nguyen tac:

```text
ONE MASTER POST
ONE APPROVAL
MULTI PLATFORM
```

---

## 7. Caption theo tung nen tang

Khong copy 100% cung mot caption.

### Facebook

- Dai hon
- Giai thich ro loi ich
- CTA comment/inbox

### Instagram

- Ngan hon
- De doc
- Emoji vua phai
- Hashtag

### Threads

- Tu nhien
- Conversational
- Han che cam giac quang cao cung

### TikTok

- Rat ngan
- Uu tien hook
- Hashtag vua du

---

## 8. Video Content Formula

Thoi luong uu tien:

```text
15-35 giay
```

Vi du:

```text
Scene 1 - 0-3s
Khach moi tim nha hang cuoi khong ra?

Scene 2 - 3-7s
Thiep cuoi online gan Google Maps ngay tren thiep.

Scene 3 - 7-12s
Demo bam "Xem ban do".

Scene 4 - 12-17s
Khach chi can mot lan cham.

Scene 5 - 17-22s
Khong con hoi: "Nha hang o dau vay?"

Scene 6 - 22-27s
Nhan "MAU" de xem demo.
```

---

## 9. Telegram UX muc tieu

Command:

```text
/new
```

Bot hoi:

```text
Ban muon tao noi dung gi?

[Cuoi]
[Sinh nhat]
[Thoi noi]
[Tan gia]
[Tat nien]
[Mung tho]
```

Sau do:

```text
Ban muon dang dang nao?

[Demo]
[Tinh nang]
[Meo]
[Van de]
[Viral]
[Ban hang]
```

Sau do:

```text
Gui noi dung, anh hoac video.
```

Preview:

```text
PREVIEW

Loai: Thiep cuoi

Caption:
...

Facebook    YES
Instagram   YES
Threads     YES
TikTok      YES

[DANG TAT CA]
[SUA]
[HUY]
```

---

## 10. V1 Scope

V1 chi can chay duoc:

```text
Telegram
  -> Telegram Trigger
  -> Edit Fields
  -> Master Post
  -> Telegram Send Message
  -> Preview
```

Chua tich hop social platform trong giai doan dau.

Definition of Done V1:

```text
User gui:
"Test bai dang thiep cuoi online"

Bot tra:
"PREVIEW BAI DANG"
```

---

## 11. Setup Windows

### Required software

Cai:

```text
Docker Desktop
cloudflared
Telegram
```

Kiem tra:

```powershell
docker --version
docker compose version
cloudflared --version
```

---

## 12. Tao n8n local

Tao thu muc:

```powershell
mkdir C:\n8n-social
cd C:\n8n-social
```

Tao `compose.yaml`:

```yaml
services:
  n8n:
    image: n8nio/n8n
    container_name: n8n-social
    restart: unless-stopped

    ports:
      - "5678:5678"

    environment:
      - TZ=Asia/Ho_Chi_Minh
      - GENERIC_TIMEZONE=Asia/Ho_Chi_Minh
      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
      - N8N_WEBHOOK_URL=${N8N_WEBHOOK_URL}
      - N8N_PROXY_HOPS=1

    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

Khong hard-code version n8n neu chua xac minh stable version hien tai.

---

## 13. Cloudflare Quick Tunnel

Chay:

```powershell
cloudflared tunnel --url http://localhost:5678
```

Nhan URL dang:

```text
https://xxxxx.trycloudflare.com
```

Tao `.env`:

```env
N8N_WEBHOOK_URL=https://xxxxx.trycloudflare.com/
```

Khoi dong:

```powershell
docker compose up -d
```

Kiem tra:

```powershell
docker compose ps
```

Mo:

```text
http://localhost:5678
```

---

## 14. Tao Telegram Bot

Trong Telegram:

```text
@BotFather
```

Gui:

```text
/newbot
```

Vi du:

```text
Name:
Thiep Online Social

Username:
thieponline_social_bot
```

BotFather tra token.

Security:

```text
- Khong commit Telegram Bot Token vao Git.
- Khong dat token truc tiep trong workflow JSON.
- Khong dua token vao screenshot.
- Token phai luu trong n8n Credentials.
```

---

## 15. n8n Workflow V1

Tao workflow:

```text
Social Publisher - Telegram Intake
```

Nodes:

```text
Telegram Trigger
       -> Edit Fields
       -> Telegram Send Message
```

### Telegram Trigger

Event:

```text
Message
```

Options:

```text
Download Images/Files = ON
```

### Edit Fields

Fields:

```text
chatId
service
content
contentType
platforms
status
```

Expressions:

```text
chatId = {{ $json.message.chat.id }}
service = WEDDING
content = {{ $json.message.text }}
contentType = GENERAL
platforms = FACEBOOK,INSTAGRAM,THREADS,TIKTOK
status = DRAFT
```

### Telegram Send Message

Chat ID:

```text
{{ $json.chatId }}
```

Message:

```text
PREVIEW BAI DANG

Loai: {{ $json.service }}

Noi dung:
{{ $json.content }}

Nen tang:
Facebook YES
Instagram YES
Threads YES
TikTok YES

Trang thai: {{ $json.status }}
```

---

## 16. Test Case V1

Input Telegram:

```text
Thiep cuoi online giup khach de dang xem dia diem,
RSVP va album anh ngay tren dien thoai.
```

Expected:

```text
PREVIEW BAI DANG

Loai: WEDDING

Noi dung:
Thiep cuoi online giup khach de dang xem dia diem,
RSVP va album anh ngay tren dien thoai.

Facebook YES
Instagram YES
Threads YES
TikTok YES

Trang thai: DRAFT
```

---

## 17. V2 - Telegram Menu

Sau khi V1 on dinh, them inline buttons:

```text
Cuoi
Sinh nhat
Thoi noi
Tan gia
Tat nien
Mung tho
```

Sau do:

```text
Demo
Tinh nang
Meo
Van de
Viral
Ban hang
```

Sau do:

```text
DANG TAT CA
SUA
HUY
```

Su dung Telegram Callback Query.

---

## 18. Thu tu tich hop Social

Tuyet doi khong lam ca 4 nen tang cung luc.

Thu tu:

```text
1. Facebook Page
2. Instagram
3. Threads
4. TikTok Draft
```

Moi platform phai co workflow/test rieng.

---

## 19. Facebook Phase

Target:

```text
Facebook Page
```

Khong xay automation dua tren personal profile.

Flow:

```text
Master Post
  -> Facebook Caption Adapter
  -> Facebook Publisher
  -> Publish Result
  -> Telegram Summary
```

---

## 20. Instagram Phase

Target account:

```text
Creator
hoac
Business
```

Flow:

```text
Master Post
  -> Instagram Caption Adapter
  -> Instagram Publisher
  -> Result
```

---

## 21. Threads Phase

Flow:

```text
Master Post
  -> Threads Caption Adapter
  -> Threads Publisher
  -> Result
```

---

## 22. TikTok Phase

V1 TikTok:

```text
Master Post
  -> TikTok Upload
  -> Draft
  -> User review tren TikTok
  -> Publish
```

Khong lay Direct Post public lam buoc dau.

---

## 23. Publishing Result

Moi platform co ket qua rieng:

```json
{
  "postId": "POST-001",
  "results": [
    {"platform": "FACEBOOK", "status": "SUCCESS"},
    {"platform": "INSTAGRAM", "status": "SUCCESS"},
    {"platform": "THREADS", "status": "FAILED", "error": "TIMEOUT"},
    {"platform": "TIKTOK", "status": "DRAFT"}
  ]
}
```

Telegram summary:

```text
POST #001

Facebook    Published
Instagram   Published
Threads     Failed
TikTok      Draft
```

Retry chi platform loi.

Khong dang lai platform da SUCCESS.

---

## 24. Error Handling

Status hop le:

```text
SUCCESS
FAILED
DRAFT
RETRYABLE
AUTH_REQUIRED
```

Rules:

```text
- Khong retry vo han.
- Khong publish duplicate.
- Phai ghi ro platform loi.
- Retry mot platform khong duoc kich hoat lai cac platform da success.
```

---

## 25. AI Content - Future

Chi them AI sau khi cross-post on dinh.

Zero-cost option:

```text
Ollama local
```

Flow:

```text
Telegram
 -> Service
 -> Content Type
 -> Topic
 -> Ollama
 -> Master Post
 -> Preview
 -> Approve
```

AI output:

```json
{
  "hook": "",
  "body": "",
  "cta": "",
  "facebookCaption": "",
  "instagramCaption": "",
  "threadsCaption": "",
  "tiktokCaption": ""
}
```

Khong auto-publish noi dung AI truoc khi user approve.

---

## 26. Feature content cua Thiep Online

Cac feature nen bien thanh content:

```text
Google Maps
QR chuyen khoan
RSVP
Countdown
Album anh
Hop qua
Da ngon ngu
Domain rieng
```

Moi feature tao it nhat:

```text
Problem
Demo
Tutorial
Comparison
Sales
```

Vi du Google Maps:

```text
1. Khach khong biet duong -> Google Maps
2. Demo click Google Maps
3. Huong dan them dia diem
4. Thiep giay vs thiep online
5. 5 loi ich cua thiep co Maps
```

---

## 27. Content Calendar goi y

```text
Thu 2   - Thiep cuoi
Thu 3   - Thoi noi
Thu 4   - Thiep cuoi
Thu 5   - Tan gia
Thu 6   - Thiep cuoi
Thu 7   - Sinh nhat / Mung tho
Chu nhat - Demo / tong hop mau
```

Ty le goi y:

```text
Wedding          50%
Baby             15%
Birthday         10%
Housewarming     10%
Year-end          5%
Longevity         5%
Other             5%
```

---

## 28. KPI

Khong chi do:

```text
Views
Likes
```

Uu tien:

```text
Comments
Inbox
Demo Requests
Leads
Orders
```

Funnel:

```text
View
 -> Comment "MAU"
 -> Inbox
 -> Xem demo
 -> Lead
 -> Order
```

---

## 29. Folder Structure goi y

```text
social-publisher/

|-- README.md
|-- SOCIAL_PUBLISHER_TELEGRAM_N8N.md
|-- .env.example
|-- compose.yaml
|
|-- docs/
|   |-- TELEGRAM_SETUP.md
|   |-- FACEBOOK_SETUP.md
|   |-- INSTAGRAM_SETUP.md
|   |-- THREADS_SETUP.md
|   `-- TIKTOK_SETUP.md
|
|-- workflows/
|   |-- telegram-intake.json
|   |-- telegram-menu.json
|   |-- facebook-publisher.json
|   |-- instagram-publisher.json
|   |-- threads-publisher.json
|   `-- tiktok-draft.json
|
`-- samples/
    |-- master-post.json
    `-- captions.json
```

---

## 30. Security Requirements

Khong duoc:

```text
commit bot token
commit access token
log full OAuth token
hard-code secret trong workflow
upload .env len repository
```

`.gitignore`:

```gitignore
.env
.env.*
!.env.example

n8n_data/
temp/
downloads/
```

---

## 31. Codex Development Rules

Codex phai lam tung phase.

Moi feature:

```text
1. Analyze
2. Neu co quyet dinh kien truc: dua >= 3 phuong an
3. Compare pros/cons
4. Chon phuong an de xuat
5. Implement
6. Test
7. Document
8. Human review
```

Khong tu thay doi kien truc goc neu chua giai thich.

Khong commit secret/token.

Khong hard-code credential.

Khong build toan bo 4 social platform trong mot task.

---

## 32. Codex Task Order

### TASK 01 - Environment

Kiem tra:

```text
Docker
Docker Compose
cloudflared
```

Output:

```text
SETUP_STATUS.md
```

### TASK 02 - Local n8n

Tao:

```text
compose.yaml
.env.example
README.md
```

### TASK 03 - Telegram Setup

Tao:

```text
docs/TELEGRAM_SETUP.md
```

Bao gom:

```text
BotFather
Bot Token
n8n Credentials
Telegram Trigger
Cloudflare Tunnel
```

### TASK 04 - Workflow V1

Export workflow:

```text
workflows/telegram-intake.json
```

Flow:

```text
Telegram Trigger
 -> Edit Fields
 -> Telegram Preview
```

### TASK 05 - Telegram Menu

Flow:

```text
/new
 -> Service
 -> Content Type
 -> Content
 -> Preview
```

### TASK 06 - Approval

Buttons:

```text
DANG TAT CA
SUA
HUY
```

### TASK 07 - Facebook

Implement + test rieng Facebook Page.

### TASK 08 - Instagram

Implement + test rieng Instagram.

### TASK 09 - Threads

Implement + test rieng Threads.

### TASK 10 - TikTok

Implement TikTok Draft.

---

## 33. Future Architecture

Chi them NestJS khi can:

```text
multi-user
multi-account
persistent history
advanced scheduling
analytics
API cho app khac
complex retry
central token management
```

Khi do:

```text
Telegram
  -> n8n
  -> NestJS
  -> Database
  -> Publishers
```

Khong them NestJS trong V1.

---

## 34. Integration voi AI Video Studio

Future:

```text
AI Video Studio
  -> final.mp4
  -> Telegram Bot
  -> n8n
  -> Preview
  -> Approve
  -> Facebook
  -> Instagram
  -> Threads
  -> TikTok Draft
```

Phase sau co the bo buoc upload Telegram thu cong:

```text
AI Video Studio
  -> Webhook/API
  -> n8n
```

---

## 35. Definition of Done - Phase 1

Phase 1 hoan thanh khi:

```text
1. n8n chay local.
2. Telegram Bot ket noi n8n.
3. User gui text.
4. n8n nhan message.
5. n8n build Master Post.
6. Bot tra Preview.
7. Khong dung paid API.
8. Khong co secret trong source.
```

Khong lam social API truoc khi Phase 1 dat day du.

---

## 36. Definition of Done - Full MVP

```text
Telegram
 -> Select Service
 -> Select Content Type
 -> Send Text/Image/Video
 -> Preview
 -> Approve
 -> Facebook Page
 -> Instagram
 -> Threads
 -> TikTok Draft
 -> Telegram Summary
```

---

## 37. Final Principles

```text
ONE MASTER POST
ONE APPROVAL
MULTI PLATFORM
```

```text
Telegram = Control Center
n8n      = Orchestrator
Social   = Publishers
```

No paid API required for V1.

Khong auto-publish truoc khi user approve.

Khong over-engineer V1.

Lam xong Telegram -> n8n -> Preview truoc, sau do moi them tung social platform.
