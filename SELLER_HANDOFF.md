# PHI Store - Seller Handoff

This project is a complete custom e-commerce package:

- Responsive storefront with cart, checkout, search, categories, filtering, sorting, and pagination-ready product browsing.
- Backend API with products, inventory, orders, image uploads, stats, health check, and admin authentication.
- Admin dashboard for products, stock, orders, order status updates, order search, and CSV export.
- PWA-ready frontend with manifest, service worker, robots.txt, and sitemap.xml.
- WhatsApp order flow plus backend order capture.
- Google Sheets fallback can remain as a backup channel.

## Before Delivery

1. Set backend environment variables from `backend/.env.example`.
2. Change the default admin password or create a fresh admin.
3. Set `CONFIG.API_URL` in `store/script.js` to the deployed backend URL.
4. Replace placeholder frontend URLs in `store/index.html`, `store/robots.txt`, and `store/sitemap.xml`.
5. Do not commit SQLite runtime files: `backend/newmax.db-shm` and `backend/newmax.db-wal`.
6. Deploy backend first, then frontend.
7. Test: public products, public inventory, checkout order, admin login, order export.

## Suggested Upsells

- Payment gateway integration.
- Branded domain and email.
- Monthly maintenance/support.
- Product photo optimization and upload.
- Analytics/Pixel setup.
