# SynThesis frontend

The frontend is a React single-page application built with Vite. It presents three workspace views: Brain, Catalog, and Reports. The repository constellation appears inside the Brain workflow after a query is submitted.

## Frontend structure

```text
frontend/
+-- src/
|   +-- api/
|   |   `-- index.js                     # Axios client and backend endpoint functions
|   +-- components/
|   |   +-- BrainConstellation.jsx       # Active repository-map renderer and node interactions
|   |   +-- Catalog.jsx                  # Research catalog and filters
|   |   +-- Reports.jsx                  # Methods and adviser reporting view
|   |   +-- Sidebar.jsx                  # Brain, Catalog, and Reports navigation
|   |   +-- Brain.jsx                    # Earlier Brain implementation retained for compatibility
|   |   `-- Map.jsx                      # Earlier standalone map retained for compatibility
|   +-- features/
|   |   `-- synthesis/
|   |       +-- SynthesisPage.jsx        # Active Brain chat, citations, details, and map host
|   |       `-- index.js                 # Feature export
|   +-- App.jsx                          # Top-level navigation and persisted app state
|   +-- main.jsx                         # React entry point
|   `-- index.css                        # Global layout, components, and responsive styles
+-- index.html                           # Vite HTML shell
+-- package.json                         # Scripts and dependencies
+-- package-lock.json                    # Locked Node dependency tree
+-- vite.config.js                       # Vite development configuration
+-- tailwind.config.js                   # Tailwind configuration
+-- postcss.config.js                    # PostCSS configuration
+-- run_frontend.bat                     # Windows helper script
`-- run_frontend.sh                      # macOS/Linux helper script
```

## Frontend runtime flow

```text
App.jsx
  +-- SynthesisPage.jsx (active Brain workflow)
  |     +-- POST /api/brain
  |     +-- GET /api/map
  |     `-- BrainConstellation.jsx -> hover and selected-study details
  +-- Catalog.jsx -> GET /api/catalog
  `-- Reports.jsx -> GET /api/reports
```

`App.jsx` stores the latest Brain session and shared research context in browser local storage. This lets the Catalog and Reports views use the most recent Brain result while the user remains in the app.

## API configuration

All requests are defined in [`src/api/index.js`](../frontend/src/api/index.js). The frontend uses `VITE_API_BASE` when it is set; otherwise it expects a local backend at `http://127.0.0.1:8000`.

| Function | Backend endpoint |
|---|---|
| `brainQuery` | `POST /api/brain` |
| `fetchCatalog` | `GET /api/catalog` |
| `fetchMap` | `GET /api/map` |
| `fetchReports` | `GET /api/reports` |
| `fetchHealth` | `GET /api/health` |

## Run locally

### 1. Start the backend first

Follow [the backend local setup guide](backend.md) and confirm this URL returns JSON before starting the frontend:

```text
http://127.0.0.1:8000/api/health
```

### 2. Install Node.js dependencies

Install a current Node.js LTS release. Then open a second PowerShell terminal from the repository root:

```powershell
Set-Location frontend
npm.cmd ci
```

Use `npm.cmd` on Windows PowerShell if the system blocks `npm.ps1` execution.

### 3. Create a local frontend environment file

Create `frontend/.env.local`:

```env
VITE_API_BASE=http://127.0.0.1:8000
```

This is optional for the default local backend address, but it makes the intended connection explicit.

### 4. Start the Vite development server

```powershell
npm.cmd run dev
```

Open the local URL shown by Vite, normally:

```text
http://127.0.0.1:5173
```

### 5. Verify the user flow

1. Submit a Brain query.
2. Confirm the answer includes repository sources and citation chips.
3. Hover a highlighted repository-map study to see its preview.
4. Click that study to open its full metadata panel.
5. Open Catalog and Reports to confirm the shared query context is available.

## Build a production frontend

```powershell
Set-Location frontend
npm.cmd run build
```

Vite writes the deployable static site to `frontend/dist`. Preview that production build locally with:

```powershell
npm.cmd run preview
```

## Deployment notes

- Set `VITE_API_BASE` to the public backend URL, for example `https://synthesis-api.example.com`. Do not include a trailing slash.
- `VITE_*` variables are compiled into the static build. After changing `VITE_API_BASE`, rebuild and redeploy the frontend.
- The backend must allow the deployed frontend origin through `CORS_ORIGINS`.
- Use HTTPS for both frontend and backend. An HTTPS site cannot safely call an HTTP API.
- For a static host such as Render Static Sites, use `npm ci && npm run build` as the build command and `dist` as the publish directory when `frontend` is the service root.

## Troubleshooting

| Symptom | Check |
|---|---|
| `Network Error` or `The repository network could not be loaded` | Verify the backend `/api/health` URL, then confirm the built `VITE_API_BASE` and backend `CORS_ORIGINS`. Redeploy the frontend after changing its environment variable. |
| Map hover or selection does not appear | Submit a Brain query first, use a highlighted study node, and verify `/api/map?query=...` returns data. |
| Frontend works locally but not after deployment | Replace local `127.0.0.1` with the public backend URL in the static host's `VITE_API_BASE` setting and rebuild. |
| `npm` is blocked in PowerShell | Run `npm.cmd run dev`, `npm.cmd run build`, or `npm.cmd ci`. |
