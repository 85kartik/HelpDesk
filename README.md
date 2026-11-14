# HelpDesk

HelpDesk is a college project for managing support tickets. Customers create tickets and follow replies. Administrators assign tickets to support agents. Agents reply and update ticket status.

[Open the live HelpDesk site](https://help-desk-inky-rho.vercel.app/login)

## What runs where

| Service | What it does |
|---|---|
| Vercel | Hosts the React and Vite frontend that users open in their browser. |
| Render | Runs the Node.js and Express API that handles accounts and tickets. |
| MongoDB Atlas | Stores live accounts, tickets, comments, and attachments. |
| Redis | Stores dashboard counts briefly so repeated requests can load from the cache. Render provides the managed cache. |

A live admin stats request returned `x-cache: hit`, confirming Redis served the result. HelpDesk can still load dashboard data from MongoDB when Redis is unavailable.

## Password reset email

HelpDesk uses Nodemailer to send a one-time code. The code expires after 10 minutes. Local SMTP delivery passed integration tests. Live email delivery still needs working SMTP settings on the Render API.

## Run locally

Install Node.js and start MongoDB and Redis. The included Compose file can start both with `docker compose up -d`. Copy `server/.env.example` to `server/.env` and set the database URL and a strong JWT secret.

Run these commands from the project folder:

    npm --prefix server ci
    npm --prefix client ci

Start the API and frontend in separate terminals:

    npm --prefix server run dev
    npm --prefix client run dev

Open http://localhost:5173. Run the API integration suite with `npm --prefix server test`. To include live cache checks, set `TEST_REDIS_URL` to a disposable Redis instance. See [API and Postman testing](API.md).

## Deploy

1. Import the repository into Render as a Blueprint. The root `render.yaml` defines the API and Redis cache. Set `MONGODB_URI` to your Atlas connection string and `CLIENT_ORIGINS` to your Vercel site URL. The Blueprint sets `REDIS_URL`.
2. Allow the Render service's outbound IP ranges in Atlas. Check [API health](https://helpdesk-api-44ip.onrender.com/api/health) for a ready database.
3. Import the `client` directory into Vercel as a Vite project. Set `VITE_API_URL` to `https://helpdesk-api-44ip.onrender.com/api` and redeploy.
4. To enable email, configure `SMTP_URL` and `MAIL_FROM` on Render. Store credentials in environment settings. Keep local `.env` files out of Git.

[Render Blueprint guide](https://render.com/docs/blueprints) · [Vercel Vite guide](https://vercel.com/docs/frameworks/frontend/vite)


9XacJW5YuWgR2da1_-sths-P
