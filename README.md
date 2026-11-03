# GVP Alumni Backend

Standalone Express 5 API for the GVP Alumni website. MongoDB Atlas and Cloudinary credentials are provided through environment variables.

## Local development

1. Install Node.js 22.12 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set the required MongoDB, JWT, and Cloudinary values.
4. Set `FRONTEND_URL` to the frontend origin; multiple comma-separated origins are supported.
5. Run `npm run dev`. Run `npm test` for local health, contact-fallback, and missing-database smoke checks.

## Vercel

Set `MONGO_URI`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and `FRONTEND_URL` in the Vercel project settings. `api/index.js` exports the Express app and `vercel.json` rewrites requests to it. Do not deploy until these production variables and the allowed frontend origin are configured.

Image and video files upload directly from the browser to Cloudinary using a backend-signed, purpose-scoped upload. The remaining workbook import endpoint is capped at 4 MB to stay within serverless request-body limits. Local contact fallback data is ignored by Git and is disabled in production; MongoDB is required for persistent production submissions.
