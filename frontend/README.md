# Frontend

React + TypeScript frontend for the Data Analysis System.

## Local Setup

From the repository root:

```powershell
cd frontend
npm.cmd install
```

## Run Development Server

```powershell
npm.cmd run dev
```

Default local URL:

```text
http://127.0.0.1:5173
```

## Run Tests

```powershell
npm.cmd test
```

## Run Lint and Build

```powershell
npm.cmd run lint
npm.cmd run build
```

## Notes

PowerShell may block `npm.ps1` on this machine, so use `npm.cmd` for npm commands.

## Docker Development

From the repository root:

```powershell
docker compose up --build frontend
```

The frontend container uses `VITE_API_BASE_URL=http://127.0.0.1:8000/api`.
