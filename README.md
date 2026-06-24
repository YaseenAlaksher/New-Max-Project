# New Max — Full-Stack System Setup Guide

## ما الذي بنيناه؟

```
┌─────────────────┐     API calls      ┌──────────────────────┐
│                 │ ←────────────────→ │                      │
│  Store (Netlify)│                    │  Backend (Node.js)   │
│  index.html     │                    │  Express + SQLite    │
│  script.js      │                    │  Port 3001           │
│                 │                    │                      │
└─────────────────┘                    └──────────┬───────────┘
                                                  │
                                       ┌──────────▼───────────┐
                                       │                      │
                                       │  Admin Dashboard     │
                                       │  /admin/index.html   │
                                       │                      │
                                       └──────────────────────┘
```

- **Store**: الموقع بتاعك على Netlify — مش اتغير ولا تصميمه
- **Backend**: سيرفر Node.js بيتعامل مع المنتجات، الطلبات، المخزون
- **Admin**: داشبورد منفصلة ومتكاملة لإدارة كل حاجة

---

## التثبيت خطوة بخطوة

### متطلبات أساسية
- [Node.js](https://nodejs.org) نسخة 18 أو أحدث
- npm (بيجي مع Node.js تلقائياً)

---

### الخطوة ١ — تثبيت الـ Backend

```bash
# افتح Terminal وروح لفولدر backend
cd backend

# ثبّت الـ packages
npm install

# اشغّل الـ seed عشان ينقل المنتجات الموجودة للقاعدة
node seed.js

# ابدأ السيرفر
npm start
```

المفروض تشوف:
```
🚀 New Max Backend  →  http://localhost:3001
📊 Admin Dashboard  →  http://localhost:3001/admin
✅ Default admin created
   Username : admin
   Password : admin123
```

### الخطوة ٢ — افتح الـ Admin Dashboard

افتح المتصفح على: **http://localhost:3001/admin**

سجّل دخول بـ:
- Username: `admin`
- Password: `admin123`

⚠️ **غيّر الباسورد فوراً** من Settings ← Change Password

---

### الخطوة ٣ — ربط الموقع بالـ Backend

في ملف `script.js` الموجود في فولدر `store/`:

```javascript
// ابحث عن CONFIG وعدّل API_URL
const CONFIG = {
  // ... باقي الإعدادات ...
  API_URL: 'http://localhost:3001',  // ← للتطوير المحلي
  // API_URL: 'https://your-app.railway.app',  // ← للإنتاج
};
```

بعد التعديل، الموقع هيحمّل المنتجات من الـ API تلقائياً.

---

## هيكل الملفات

```
/backend/
  server.js          ← السيرفر الرئيسي (Express + SQLite)
  seed.js            ← ينقل المنتجات الموجودة للـ database
  products_data.js   ← نسخة من products.js للـ seed script
  package.json       ← dependencies
  newmax.db          ← قاعدة البيانات (بتتخلق أوتوماتيك)
  uploads/           ← الصور المرفوعة من الداشبورد

/admin/
  index.html         ← الداشبورد الكاملة (login + كل الصفحات)

/store/              ← ملفات موقعك المعدّلة
  script.js          ← نفس الملف بس بالإضافات الجديدة
```

---

## الـ API Endpoints

### Public (للموقع — بدون authentication)
| Method | URL | الوظيفة |
|--------|-----|---------|
| GET | `/api/public/products` | كل المنتجات بنفس شكل products.js |
| GET | `/api/public/inventory` | مخزون كل variant |
| POST | `/api/orders` | تسجيل طلب جديد + ينقص المخزون |

### Admin (محتاج token)
| Method | URL | الوظيفة |
|--------|-----|---------|
| POST | `/api/auth/login` | تسجيل دخول |
| GET | `/api/stats` | إحصائيات الداشبورد |
| GET/POST | `/api/products` | عرض/إضافة منتجات |
| PUT/DELETE | `/api/products/:id` | تعديل/حذف منتج |
| POST | `/api/upload` | رفع صورة |
| GET | `/api/inventory` | كل المخزون |
| PUT | `/api/inventory/:id` | تعديل stock لـ variant |
| GET/POST | `/api/orders` | عرض/إضافة طلبات |
| PUT | `/api/orders/:id/status` | تحديث حالة الطلب |

---

## النشر على الإنتاج (Production)

### خيار ١ — Railway (الأسهل، مجاناً)

1. اعمل حساب على [railway.app](https://railway.app)
2. New Project ← Deploy from GitHub Repo
3. اختار فولدر `backend`
4. Railway هيعطيك URL زي: `https://newmax-backend.up.railway.app`
5. حط الـ URL ده في `CONFIG.API_URL` في الموقع
6. ارفع الموقع المعدّل على Netlify

### خيار ٢ — Render (مجاناً كمان)

1. اعمل حساب على [render.com](https://render.com)
2. New Web Service ← اختار الـ repo
3. Root Directory: `backend`
4. Build Command: `npm install`
5. Start Command: `npm start`

### خيار ٣ — VPS (cPanel أو DigitalOcean)

```bash
# على السيرفر
git clone [your-repo]
cd backend
npm install
npm install -g pm2
pm2 start server.js --name "newmax-backend"
pm2 save
```

---

## التطوير المحلي

```bash
# Backend مع auto-restart
cd backend
npm run dev

# الموقع على الـ browser مباشرة — افتح store/index.html
# أو استخدم Live Server في VSCode
```

---

## الداشبورد — دليل سريع

### 📊 Dashboard
- إجمالي المنتجات، الطلبات، المخزون المنخفض، الإيرادات
- آخر ٦ طلبات
- تنبيهات المخزون المنخفض

### 📦 Products
- **Add Product**: اسم (EN/AR)، سعر، فئة، باچ، ألوان+مقاسات+مخزون، صورة
- **Edit**: بنفس الفورم
- **Delete**: مع تأكيد
- **Search**: بحث فوري بالاسم

### 📈 Inventory
- اختار منتج من القايمة
- بتشوف كل تشكيلة (مقاس + لون) وكميتها
- عدّل أي رقم واضغط Save
- ألوان التحذير: 🟡 أصفر = أقل من ٥، 🔴 أحمر = صفر

### 🛒 Orders
- فلتر بالحالة: Pending / Processing / Shipped / Delivered / Cancelled
- غيّر الحالة من قايمة منسدلة مباشرة
- اضغط View عشان تشوف تفاصيل العميل والمنتجات

---

## أسئلة شائعة

**الموقع هيتأثر لو الـ backend وقع؟**
لا — الموقع بيشتغل من products.js أولاً، وبيحاول يجيب من API في الخلفية. لو فشل، مفيش تأثير.

**الطلبات بتروح فين؟**
لـ ٣ أماكن في نفس الوقت: Backend API + Google Sheets + WhatsApp

**إزاي أغيّر باسورد الـ admin؟**
من الداشبورد ← Settings ← Change Password

**إزاي أضيف admin تاني؟**
حالياً بس من الـ database مباشرة:
```bash
cd backend
node -e "
const db = require('better-sqlite3')('./newmax.db');
const bcrypt = require('bcryptjs');
db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('newadmin', bcrypt.hashSync('password123', 10));
console.log('Done');
"
```

**فين الصور اللي بارفعها من الداشبورد؟**
في `backend/uploads/` — بيتعملها serve على `/uploads/filename.jpg`

---

## Security Notes

⚠️ قبل ما تنشر على الإنتاج:
1. غيّر `JWT_SECRET` في `server.js` لقيمة عشوائية طويلة
2. غيّر باسورد الـ admin من الداشبورد
3. حط الـ secrets في environment variables مش في الكود
4. فكّر تضيف rate limiting على endpoint الـ login

---

*New Max Admin System — Built with Node.js + Express + SQLite*
