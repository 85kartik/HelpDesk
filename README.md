# HelpDesk

HelpDesk is a MERN support workspace. Customers submit and track requests, support agents manage assigned tickets, and administrators oversee tickets, users, and analytics.

## Run locally in Windows PowerShell

Requires Node.js 22.12+ or 24 and either Docker Desktop or a running MongoDB instance.

    cd "$env:USERPROFILE/Desktop/HelpDesk"
    docker compose up -d
    Copy-Item server/.env.example server/.env
    node -p "require('node:crypto').randomBytes(32).toString('hex')"
    notepad server/.env
    npm.cmd --prefix server ci
    npm.cmd --prefix client ci
    npm.cmd --prefix server run dev

Paste the generated value into JWT_SECRET in server/.env. If using Atlas or an existing MongoDB installation, set MONGODB_URI to that database and start only the Redis Compose service if needed.

In a second PowerShell window:

    cd "$env:USERPROFILE/Desktop/HelpDesk"
    npm.cmd --prefix client run dev

Open http://localhost:5173 and register a customer. The readiness endpoint is http://localhost:5000/api/health.

### Initial administrator

Set temporary environment values ADMIN_EMAIL and ADMIN_PASSWORD before running npm.cmd --prefix server run seed. The password must have at least 12 characters and fit in 72 UTF-8 bytes. Remove the variables after the seed succeeds. Select **Manage users** as an admin to promote an active customer to an agent. Assign tickets in the ticket details view.

## Architecture and design choices

- client/src holds the React routes, role-aware dashboard, plain CSS, authentication context, and the Axios service. Recharts renders support analytics.
- server/app.js registers the Express routes and shared middleware. server/models.js defines users, tickets, comments, and activity with indexes and ObjectId references. A ticket references its creator and assigned agent. Comments and activity reference both the ticket and the user responsible for the entry.
- Every protected request verifies the JWT and looks up an active user in MongoDB. Tickets use a database filter derived from the authenticated user. Registration ignores role fields.
- Axios keeps the one-hour JWT in memory. A reload clears the session and requires sign-in. Nothing is persisted in browser storage. Use HTTPS in production. Sign-out clears the browser token. A copied token remains usable until expiration or account deactivation.
- Multer accepts up to three PNG, JPEG, or PDF files of 4 MB each. It checks MIME and signature and serves downloads through authorized ticket routes. Attachments live in their parent ticket or comment document, so Atlas provides durable storage. This fixed limit keeps a single upload under MongoDB's document size limit.
- Redis caches admin and per-agent aggregates for 60 seconds. Ticket and role mutations rotate a cache revision. When Redis is unavailable, requests query MongoDB. Following a Redis outage, previously cached values can remain visible for the remainder of their TTL.
- Nodemailer sends best-effort plain-text notifications with SMTP_URL and MAIL_FROM. Notifications have no durable retry queue.
- Ticket activity, comment cleanup, and ticket writes span multiple MongoDB documents. The local standalone setup does not use multi-document transactions, so a database failure can leave a partially applied operation.

## Testing

    npm.cmd --prefix client run build
    npm.cmd --prefix server test

The API suite starts an isolated MongoDB instance. It can use an existing mongod binary if you set MONGOMS_SYSTEM_BINARY first. Otherwise it downloads the binary. Set TEST_REDIS_URL to a disposable Redis instance to exercise Redis hits and invalidation. See [API and Postman testing](API.md).

## Deployment

1. Push the repository to GitHub with the lockfiles and environment examples.
2. Create a Render Node web service with root directory server, build command npm ci, start command npm start, and health check /api/health. Set NODE_ENV=production, NODE_VERSION=24, TRUST_PROXY to the appropriate proxy hop count, MONGODB_URI, JWT_SECRET, REDIS_URL, SMTP_URL, and MAIL_FROM. Use a TLS Redis URL if your provider requires one.
3. Use MongoDB Atlas with a dedicated database user and authorize the Render service to connect. The administrator seed can run with temporary credentials from a trusted machine that can reach Atlas.
4. Import the GitHub repository into Vercel, select the client directory and Vite preset, and set VITE_API_URL to the Render HTTPS origin followed by /api. The Vercel rewrite serves React Router deep links. Set CLIENT_ORIGINS on Render to the exact Vercel origin.
5. Verify health, login, an authorized download, dashboard cache headers, and an SMTP notification before using real customer data.

[Render Express deployment](https://render.com/docs/deploy-node-express-app) · [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite)

## Screenshots

Portfolio screenshots can be captured from the dashboard, ticket conversation, and admin analytics after running the project with sample support tickets.


Administrator registration can also be enabled by setting ADMIN_SIGNUP_CODE to a random setup code in server/.env. Select Administrator when registering and enter that code. Share it only with trusted administrators. Remove it and restart the API to disable administrator registration. The admin queue groups open and in-progress tickets under Pending and resolved tickets under Done.

### Deploy Redis with the API

Connect the repository as a Render Blueprint using render.yaml. The Blueprint creates the API and a private, same-region Render Key Value instance and injects its connection string as REDIS_URL. Supply Atlas MONGODB_URI and the exact Vercel CLIENT_ORIGINS during setup. Set VITE_API_URL on Vercel to the Render API URL ending in /api. Configure SMTP_URL and MAIL_FROM separately if needed. After deployment, make two authenticated GET requests to /api/admin/stats and inspect X-Cache for miss then hit. Update a test ticket and check for a miss with refreshed counts.
