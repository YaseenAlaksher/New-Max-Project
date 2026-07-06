# Installation Guide

## Backend

```bash
cd backend
npm install
cp .env.example .env
npm run seed
npm start
```

Admin dashboard: `http://localhost:3001/admin`

## Storefront

Deploy the `store` folder to static hosting.
Keep `CONFIG.API_URL` in `store/script.js` pointed to the deployed backend.
