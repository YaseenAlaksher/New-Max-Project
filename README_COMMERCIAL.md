# PHI E-Commerce Platform

Production-ready static storefront with a Node.js/Express admin backend and SQLite database.

## Included

- Store settings managed from the dashboard
- Homepage banner management
- Product, inventory, and order management
- Dynamic contact/social/SEO settings
- Customer reviews with admin approval
- Analytics dashboard with revenue/orders charts
- Product view tracking
- Optional order email notifications
- Upload support through local uploads or Cloudinary
- Rate limiting, validation, secure headers, and parameterized SQLite queries

## Not Included By Request

Coupon/discount functionality is intentionally not implemented.


## Demo Data

The backend includes a safe demo data system for client presentations.

- Seed demo data: `cd backend && npm run demo:seed`
- Reset demo data: `cd backend && npm run demo:reset`
- View summary: `cd backend && npm run demo:summary`

Demo records are prefixed with `demo-` products and `DEMO-` orders. The Admin Dashboard also includes a Demo Data card with Seed and Reset buttons.
