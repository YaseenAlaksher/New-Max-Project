// ============================================================
//  NEW MAX — Google Apps Script   (v2 — adds live inventory)
//  الصق الكود ده في Google Apps Script وانشره كـ Web App
//
//  لو عندك نسخة قديمة شغالة بالفعل (الموقع شغال ومتربط بشيت):
//  1. افتح نفس الشيت اللي مربوط بالموقع (متفتحش شيت جديد!)
//  2. من القايمة: Extensions ← Apps Script
//  3. امسح كل الكود القديم، الصق الكود ده مكانه كامل
//  4. من القايمة: Deploy ← Manage deployments
//  5. دوس على أيقونة القلم (✎ Edit) جنب الـ deployment الموجود
//  6. في خانة "Version" اختار "New version"
//  7. دوس Deploy
//  ✅ ده بيحافظ على نفس الـ URL، مش هتحتاج تغيّر حاجة في الموقع.
//
//  لو دي أول مرة (مفيش شيت أصلاً):
//  1. افتح Google Sheets جديد
//  2. من القايمة: Extensions ← Apps Script
//  3. احذف الكود الموجود والصق الكود ده
//  4. من القايمة: Deploy ← New deployment
//  5. اختر Type: Web app
//  6. Execute as: Me
//  7. Who has access: Anyone
//  8. اضغط Deploy وخد الـ URL
//  9. حط الـ URL ده في script.js في CONFIG.SHEETS_URL
//
//  أول ما السكريبت يشتغل، هيعمل شيت جديد اسمه "المخزون" فيه كل
//  منتج/مقاس/لون بكمية افتراضية = 5. ده رقم placeholder بس —
//  افتح شيت "المخزون" وعدّل الأرقام لتطابق مخزونك الحقيقي.
// ============================================================

const SHEET_ORDERS    = 'الطلبات';
const SHEET_REVIEWS   = 'التقييمات';
const SHEET_INVENTORY = 'المخزون';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    if (data.type === 'order') {
      saveOrder(ss, data);
      if (Array.isArray(data.items) && data.items.length) {
        decrementInventory(ss, data.items);
      }
    } else if (data.type === 'review') {
      saveReview(ss, data);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', msg: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
//  GET — حالة السيرفر + قراءة المخزون الحي
//  ?action=inventory  → بيرجع كل المخزون الحالي كـ JSON
// ============================================================
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'inventory') {
    try {
      const ss    = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = getOrCreateInventorySheet(ss);
      const rows  = sheet.getDataRange().getValues();
      const inventory = [];
      for (let r = 1; r < rows.length; r++) {
        if (!rows[r][0]) continue;
        inventory.push({
          productId: String(rows[r][0]),
          size:      String(rows[r][1]),
          color:     String(rows[r][2]),
          stock:     Number(rows[r][3]) || 0,
        });
      }
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', inventory: inventory }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', msg: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService
    .createTextOutput('✅ New Max Sheets API — شغال!')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ============================================================
//  حفظ الطلب
//  ملحوظة: قبل كده كانت أسماء الحقول هنا (data.name, data.date, ...)
//  مش متطابقة مع اللي بيبعته الموقع فعلياً (data.customer.name,
//  data.dateStr, ...) فكانت بتتسجل فاضية في الشيت. اتصلحت هنا.
// ============================================================
function saveOrder(ss, data) {
  let sheet = ss.getSheetByName(SHEET_ORDERS);

  // لو الشيت مش موجود، عمله
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ORDERS);
    sheet.appendRow([
      'رقم الطلب',
      'التاريخ',
      'الوقت',
      'الاسم',
      'التليفون',
      'المحافظة',
      'المدينة',
      'العنوان',
      'المنتجات',
      'الإجمالي',
      'الدفع',
      'الحالة',
    ]);
    // تنسيق الهيدر
    sheet.getRange(1, 1, 1, 12).setBackground('#3062be').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 12, 150);
  }

  const customer = data.customer || {};
  const itemsText = Array.isArray(data.items)
    ? data.items.map(i => `${i.name} (${i.color}, ${i.size}) ×${i.qty}`).join(' | ')
    : (data.items || '');

  sheet.appendRow([
    data.orderId        || '',
    data.dateStr         || data.date || '',
    data.timeStr         || data.time || '',
    customer.name        || '',
    customer.phone       || '',
    customer.gov         || '',
    customer.city        || '',
    customer.address     || '',
    itemsText,
    data.total           || '',
    data.payment         || 'الدفع عند الاستلام',
    data.status          || 'جديد',
  ]);
}

// ============================================================
//  حفظ التقييم
// ============================================================
function saveReview(ss, data) {
  let sheet = ss.getSheetByName(SHEET_REVIEWS);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_REVIEWS);
    sheet.appendRow([
      'التاريخ',
      'الاسم',
      'المدينة',
      'المنتج',
      'التقييم (/ 5)',
      'النص',
      'الحالة',
    ]);
    sheet.getRange(1, 1, 1, 7).setBackground('#16a34a').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 7, 160);
  }

  sheet.appendRow([
    data.date    || new Date().toLocaleDateString('ar-EG'),
    data.name    || '',
    data.city    || '',
    data.product || '',
    data.stars   || '',
    data.text    || '',
    'جديد — لم ينشر بعد',
  ]);
}

// ============================================================
//  المخزون — إنشاء الشيت أول مرة + تعبئته بأرقام مبدئية
// ============================================================
function getOrCreateInventorySheet(ss) {
  let sheet = ss.getSheetByName(SHEET_INVENTORY);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SHEET_INVENTORY);
  sheet.appendRow(['رقم المنتج', 'المقاس', 'اللون', 'الكمية المتاحة']);
  sheet.getRange(1, 1, 1, 4).setBackground('#dc2626').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 4, 160);

  // أرقام مبدئية (placeholder) = 5 لكل تشكيلة — غيّرها هنا في الشيت
  // عشان تطابق مخزونك الحقيقي. الموقع هيقرا من هنا مباشرة.
  const seed = [
  ['nm-001', 'S', 'Red', 5],
  ['nm-001', 'S', 'Blue', 5],
  ['nm-001', 'S', 'Black', 5],
  ['nm-001', 'M', 'Red', 5],
  ['nm-001', 'M', 'Blue', 5],
  ['nm-001', 'M', 'Black', 5],
  ['nm-001', 'L', 'Red', 5],
  ['nm-001', 'L', 'Blue', 5],
  ['nm-001', 'L', 'Black', 5],
  ['nm-001', 'XL', 'Red', 5],
  ['nm-001', 'XL', 'Blue', 5],
  ['nm-001', 'XL', 'Black', 5],
  ['nm-002', 'S', 'Red', 5],
  ['nm-002', 'S', 'Blue', 5],
  ['nm-002', 'S', 'Black', 5],
  ['nm-002', 'M', 'Red', 5],
  ['nm-002', 'M', 'Blue', 5],
  ['nm-002', 'M', 'Black', 5],
  ['nm-002', 'L', 'Red', 5],
  ['nm-002', 'L', 'Blue', 5],
  ['nm-002', 'L', 'Black', 5],
  ['nm-002', 'XL', 'Red', 5],
  ['nm-002', 'XL', 'Blue', 5],
  ['nm-002', 'XL', 'Black', 5],
  ['nm-003', 'S', 'Blue', 5],
  ['nm-003', 'S', 'Black', 5],
  ['nm-003', 'M', 'Blue', 5],
  ['nm-003', 'M', 'Black', 5],
  ['nm-003', 'L', 'Blue', 5],
  ['nm-003', 'L', 'Black', 5],
  ['nm-003', 'XL', 'Blue', 5],
  ['nm-003', 'XL', 'Black', 5],
  ['nm-004', 'S', 'Red', 5],
  ['nm-004', 'S', 'Blue', 5],
  ['nm-004', 'S', 'Black', 5],
  ['nm-004', 'M', 'Red', 5],
  ['nm-004', 'M', 'Blue', 5],
  ['nm-004', 'M', 'Black', 5],
  ['nm-004', 'L', 'Red', 5],
  ['nm-004', 'L', 'Blue', 5],
  ['nm-004', 'L', 'Black', 5],
  ['nm-004', 'XL', 'Red', 5],
  ['nm-004', 'XL', 'Blue', 5],
  ['nm-004', 'XL', 'Black', 5],
  ['nm-005', 'One Size', 'Red', 5],
  ['nm-005', 'One Size', 'Blue', 5],
  ['nm-005', 'One Size', 'Black', 5],
  ['nm-006', 'S', 'Red', 5],
  ['nm-006', 'S', 'Blue', 5],
  ['nm-006', 'S', 'Black', 5],
  ['nm-006', 'M', 'Red', 5],
  ['nm-006', 'M', 'Blue', 5],
  ['nm-006', 'M', 'Black', 5],
  ['nm-006', 'L', 'Red', 5],
  ['nm-006', 'L', 'Blue', 5],
  ['nm-006', 'L', 'Black', 5],
  ['nm-006', 'XL', 'Red', 5],
  ['nm-006', 'XL', 'Blue', 5],
  ['nm-006', 'XL', 'Black', 5],
  ['nm-007', 'S', 'Blue', 5],
  ['nm-007', 'S', 'Black', 5],
  ['nm-007', 'M', 'Blue', 5],
  ['nm-007', 'M', 'Black', 5],
  ['nm-007', 'L', 'Blue', 5],
  ['nm-007', 'L', 'Black', 5],
  ['nm-007', 'XL', 'Blue', 5],
  ['nm-007', 'XL', 'Black', 5],
  ['nm-008', 'S', 'Red', 5],
  ['nm-008', 'S', 'Blue', 5],
  ['nm-008', 'S', 'Black', 5],
  ['nm-008', 'M', 'Red', 5],
  ['nm-008', 'M', 'Blue', 5],
  ['nm-008', 'M', 'Black', 5],
  ['nm-008', 'L', 'Red', 5],
  ['nm-008', 'L', 'Blue', 5],
  ['nm-008', 'L', 'Black', 5],
  ['nm-008', 'XL', 'Red', 5],
  ['nm-008', 'XL', 'Blue', 5],
  ['nm-008', 'XL', 'Black', 5],
  ['nm-009', 'S', 'Black', 5],
  ['nm-009', 'S', 'Blue', 5],
  ['nm-009', 'M', 'Black', 5],
  ['nm-009', 'M', 'Blue', 5],
  ['nm-009', 'L', 'Black', 5],
  ['nm-009', 'L', 'Blue', 5],
  ['nm-009', 'XL', 'Black', 5],
  ['nm-009', 'XL', 'Blue', 5],
  ['nm-010', 'S', 'Red', 5],
  ['nm-010', 'S', 'Black', 5],
  ['nm-010', 'M', 'Red', 5],
  ['nm-010', 'M', 'Black', 5],
  ['nm-010', 'L', 'Red', 5],
  ['nm-010', 'L', 'Black', 5],
  ['nm-010', 'XL', 'Red', 5],
  ['nm-010', 'XL', 'Black', 5],
  ['nm-011', 'S', 'Red', 5],
  ['nm-011', 'S', 'Blue', 5],
  ['nm-011', 'S', 'Black', 5],
  ['nm-011', 'M', 'Red', 5],
  ['nm-011', 'M', 'Blue', 5],
  ['nm-011', 'M', 'Black', 5],
  ['nm-011', 'L', 'Red', 5],
  ['nm-011', 'L', 'Blue', 5],
  ['nm-011', 'L', 'Black', 5],
  ['nm-011', 'XL', 'Red', 5],
  ['nm-011', 'XL', 'Blue', 5],
  ['nm-011', 'XL', 'Black', 5],
  ['nm-012', 'One Size', 'Black', 5],
  ['nm-012', 'One Size', 'Blue', 5],
  ];

  sheet.getRange(2, 1, seed.length, 4).setValues(seed);
  return sheet;
}

// ============================================================
//  نقص الكمية بعد كل طلب (منتج + مقاس + لون)
//  بيستخدم LockService عشان لو طلبين جم في نفس اللحظة بالظبط
//  ميحصلش تعارض في القراءة/الكتابة.
// ============================================================
function decrementInventory(ss, items) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch (e) {
    // لو مقدرش ياخد القفل خلال 5 ثواني، يكمل عادي بدل ما يعلّق الطلب
  }

  try {
    const sheet = getOrCreateInventorySheet(ss);
    const rows  = sheet.getDataRange().getValues();

    // بناء خريطة: "productId|size|color" → رقم الصف في الشيت
    const rowIndexByKey = {};
    for (let r = 1; r < rows.length; r++) {
      const key = rows[r][0] + '|' + rows[r][1] + '|' + rows[r][2];
      rowIndexByKey[key] = r + 1; // أرقام صفوف الشيت تبدأ من 1
    }

    items.forEach(item => {
      const key = (item.productId || '') + '|' + (item.size || '') + '|' + (item.color || '');
      const rowNum = rowIndexByKey[key];
      if (!rowNum) return; // التشكيلة دي مش موجودة في شيت المخزون، تجاهلها

      const cell    = sheet.getRange(rowNum, 4);
      const current  = Number(cell.getValue()) || 0;
      const qty      = Number(item.qty) || 0;
      cell.setValue(Math.max(0, current - qty));
    });
  } finally {
    lock.releaseLock();
  }
}
