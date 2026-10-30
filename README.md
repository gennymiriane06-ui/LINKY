# Linkly — URL Shortener API with Analytics

Linkly is a RESTful URL shortener API built with Node.js, Express.js and PostgreSQL. It allows users to transform long URLs into short, shareable links while tracking visitor activity through click analytics.

The project includes user authentication, custom short codes, automatic redirects, link expiration, click tracking, paginated analytics and CSV exports.

## Features

- **User Authentication:** Register and log in securely using hashed passwords and JWT authentication.
- **URL Shortening:** Convert long URLs into short, shareable links.
- **Custom Short Codes:** Allow users to choose their preferred short codes.
- **Duplicate URL Handling:** Reuse an existing shortened link for an already registered destination URL.
- **URL Redirection:** Redirect visitors to the original destination using HTTP 302.
- **Link Expiration:** Support expiration dates for shortened URLs.
- **Click Tracking:** Record visitor activity, including timestamps, referrers and user agents.
- **Click Analytics:** Retrieve link information and click history.
- **Pagination:** Retrieve click records in manageable pages.
- **CSV Export:** Export click analytics as CSV files.
- **Link Management:** Delete shortened links.
- **API Documentation:** Interactive API documentation using Swagger UI.
- **Database Health Check:** Check the availability of the PostgreSQL database.

## Technologies Used

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | REST API framework |
| PostgreSQL | Relational database |
| pg | PostgreSQL database connection |
| JWT | Authentication |
| bcrypt | Password hashing |
| Zod | Request validation |
| Helmet | HTTP security headers |
| CORS | Cross-origin resource sharing |
| Swagger UI | API documentation |
| Supertest | HTTP testing support |

## Project Structure

linkly/
├── docs/
│   └── openapi.yaml
├── src/
│   ├── config/
│   │   ├── database.js
│   │   └── env.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   └── link.controller.js
│   ├── db/
│   │   ├── migrations/
│   │   │   └── 001_initial_schema.sql
│   │   ├── check-connection.js
│   │   └── migrate.js
│   ├── middleware/
│   │   └── auth.middleware.js
│   ├── repositories/
│   ├── routes/
│   │   ├── auth.routes.js
│   │   └── link.routes.js
│   ├── schemas/
│   │   ├── auth.schema.js
│   │   └── link.schema.js
│   ├── services/
│   │   ├── auth.service.js
│   │   └── link.service.js
│   ├── app.js
│   └── server.js
├── tests/
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md

## Requirements

Before installing Linkly, make sure you have:

- Node.js 18 or later
- npm
- PostgreSQL
- Git

## Installation and Setup

### 1. Clone the repository

git clone gennymiriame06-ui
```

Navigate into the project:

cd linkly

### 2. Install dependencies

npm install

cp .env.example .env

Add the following configuration to `.env`:

NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://linkly_user:your_secure_password@localhost:5432/linkly

JWT_SECRET=replace_this_with_a_long_random_secret_of_at_least_32_characters
JWT_EXPIRES_IN=1h

BASE_URL=http://localhost:3000

**Important:** Never commit your `.env` file or expose your JWT secret and database password.

### 5. Check the database connection

npm run db:check


### 6. Run database migrations

```bash
npm run migrate
```

### 7. Start the development server

npm run dev

The API will be available at:

`http://localhost:3000`

## API Documentation

Linkly provides interactive Swagger documentation.

Open:

`http://localhost:3000/docs`

You can explore the endpoints, view request and response formats, and test API operations.

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a new account |
| POST | `/auth/login` | Authenticate an existing user |

### URL Management

| Method | Endpoint | Description |
|---|---|---|
| POST | `/links` | Create a shortened URL |
| GET | `/links/:code` | Retrieve shortened URL details |
| DELETE | `/links/:code` | Delete a shortened URL |
| GET | `/:code` | Redirect to the original URL |

### Analytics

| Method | Endpoint | Description |
|---|---|---|
| GET | `/links/:code/clicks` | Retrieve click history |
| GET | `/links/:code/clicks.csv` | Export click history as CSV |

### System

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | API welcome information |
| GET | `/health` | Check API and database health |

**Authentication:** Link management and analytics endpoints require a valid JWT access token. Registration, login and public short-link redirection do not require authentication.

For exact request bodies, query parameters and response schemas, consult the Swagger documentation.

## Redirect and Expiration Behavior

When a visitor opens a shortened URL:

- If the code exists and is valid, Linkly redirects the visitor using HTTP `302`.
- If the code does not exist, the API returns HTTP `404`.
- If the link has expired, the API returns HTTP `410`.
- Successful redirects are recorded in the click analytics.

## Database Design

Linkly uses PostgreSQL with the following main tables:

- **users:** Stores registered user accounts and password hashes.
- **links:** Stores shortened URLs, destination URLs, creation dates, expiration dates and click counts.
- **user_links:** Associates users with shortened links.
- **clicks:** Stores visitor activity, timestamps, referrers and user agents.

Foreign keys and indexes help maintain relationships and improve lookup performance.

## Running the Application

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

Database connection check:

```bash
npm run db:check
```

Database migration:

```bash
npm run migrate
```

Tests:

```bash
npm test
```

## Health Check

To verify that the API and PostgreSQL database are connected, visit:

`http://localhost:3000/health`

A successful response should look like:

```json
{
  "status": "ok",
  "service": "Linkly API",
  "database": "connected"
}
```

## Security Considerations

- Passwords are hashed using bcrypt.
- Protected endpoints use JWT authentication.
- Request data is validated using Zod.
- Helmet adds security-related HTTP headers.
- Database operations use parameterized SQL queries.
- Environment variables are used for sensitive configuration.

## Future Improvements

Potential improvements include:

- More detailed analytics dashboards.
- Rate limiting for link creation.
- QR code generation.
- Automated link expiration cleanup.
- Docker-based deployment.
- Automated integration and load testing.

## Author

**Developed as a Node.js backend project.**

Project: Linkly — URL Shortener API with Analytics.

## License

This project is licensed under the ISC License.