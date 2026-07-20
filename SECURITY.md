# Security Policy

## Current Security Boundary

This repository is an MVP data analysis workspace intended for local development and small-team evaluation. It is not yet hardened for direct exposure to the public internet.

Before any non-local deployment:

- Replace `APP_SECRET_KEY`, PostgreSQL credentials, and development access tokens.
- Set a strong, stable `EXTERNAL_CONNECTION_ENCRYPTION_KEY`, store it outside the repository, and include it in protected deployment backups. Changing or losing this key makes stored external-database credentials unreadable.
- Replace development authentication with production-grade password hashing and token handling.
- Prefer a managed secret store for production deployments that require centralized credential rotation, access policies, or key auditing.
- Use a least-privilege, read-only account for every external database connection.
- Restrict CORS origins and network access to trusted hosts.
- Review uploaded files and database contents before sharing logs, backups, screenshots, or bug reports.

## Sensitive Data Rules

Never commit:

- `.env` files or production configuration.
- API keys, access tokens, private keys, certificates, or service-account files.
- Uploaded user files, database dumps, local storage directories, or generated datasets.
- Real external-database credentials or private connection endpoints.

The repository tracks `.env.example` only as a template. Values in that file and Docker Compose fallbacks are development placeholders, not production secrets.

## Reporting A Vulnerability

Do not open a public issue containing credentials, private data, or exploit details. Use GitHub's private vulnerability reporting for this repository when available, or contact the repository owner privately through their GitHub profile.

Include the affected component, reproduction conditions, impact, and any suggested mitigation. Remove all real user data and credentials from examples.
