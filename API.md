# API and Postman testing

Use http://localhost:5000/api as the base URL. Successful responses contain success, message, and data. Errors contain success and message. A missing or expired token yields 401. Role restrictions yield 403. A valid ticket ID outside the current user's scope yields 404.

| Method and path | Access | Request and result |
|---|---|---|
| GET /health | Public | Returns database readiness |
| POST /auth/register | Public | name, email, password. Returns user and token, status 201 |
| POST /auth/login | Public | email, password. Returns user and token |
| GET /auth/profile | Signed in | Returns current user |
| POST /tickets | Customer | title, description, category and optional multipart attachments. Returns ticket, status 201 |
| GET /tickets/my | Customer | Returns paginated owned tickets |
| GET /tickets/assigned | Agent | Returns paginated assigned tickets |
| GET /tickets | Admin | Returns paginated tickets |
| GET /tickets/:id | Ticket scope | Returns ticket and recent activity history |
| PATCH /tickets/:id/status | Assigned agent or admin | status, returns ticket |
| PATCH /tickets/:id/assign | Admin | agentId, or null to unassign, returns ticket |
| PATCH /tickets/:id/priority | Admin | priority, returns ticket |
| DELETE /tickets/:id | Admin | Returns deleted ticket ID |
| GET /tickets/:id/comments | Ticket scope | Returns paginated replies |
| POST /tickets/:id/comments | Ticket scope | message and optional multipart attachments. Returns reply, status 201 |
| GET /tickets/:id/attachments/:file | Ticket scope | Returns ticket attachment bytes |
| GET /tickets/:id/comments/:comment/attachments/:file | Ticket scope | Returns reply attachment bytes |
| GET /admin/users and /admin/agents | Admin | Returns paginated account records |
| PATCH /admin/users/:id/role | Admin | role set to agent, returns updated account |
| GET /admin/stats | Admin | Returns dashboard aggregates |
| GET /dashboard/stats | Signed in | Returns role-scoped dashboard aggregates |

List parameters include page and limit. Ticket lists also accept q, status, priority, category and sort (newest or oldest). Categories are technical, billing and general. Priorities are low, medium and high. Statuses are open, in-progress and resolved.

## Postman walkthrough

1. Create a collection and a baseUrl variable with http://localhost:5000/api. Send GET {{baseUrl}}/health and expect 200 with data.database set to ready.
2. Send POST {{baseUrl}}/auth/register with JSON containing name, email, and a password of at least 12 characters. Save data.token in a local collection variable customerToken. In authorization, choose Bearer Token and enter {{customerToken}}.
3. GET /auth/profile should return the customer. POST /tickets with form-data fields title, description, category, and a file field named attachments. Save data._id as ticketId and confirm GET /tickets/my contains it.
4. Repeat registration for an unrelated customer. GET /tickets/{{ticketId}} using the second token should return 404. A request to the attachment URL using that token should also return 404.
5. Log in as the seeded administrator. Promote the second customer using PATCH /admin/users/:id/role with JSON {"role":"agent"}. Assign the ticket with PATCH /tickets/:id/assign using {"agentId":"<agent user id>"}.
6. Using the agent token, verify /tickets/assigned, POST a comment with {"message":"I am reviewing this."}, then PATCH the status with {"status":"resolved"}. The original customer should see the reply and history.
7. With Redis running, request agent dashboard stats twice and check for a miss followed by a hit in X-Cache. Change the ticket status and repeat. The next request should be a miss and should report the new count. Run with Redis disabled to confirm bypass while MongoDB continues serving stats.
8. Use the administrator token to delete the test ticket. A subsequent customer GET should return 404.
