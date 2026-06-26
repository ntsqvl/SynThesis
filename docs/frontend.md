# SynThesis — Frontend Guide
> 24-hour build · Tabs in scope: **Brain**, **Catalog**, **Map**, **Reports**

---

## Stack

| Tool | Reason |
|---|---|
| **Vite + React** | Fastest dev server, instant HMR |
| **Tailwind CSS** | No design system to configure |
| **react-force-graph-2d** | Constellation node-link graph out of the box |
| **Axios** | Clean async API calls |

---

## Step 1 — Bootstrap (10 min)

```bash
npm create vite@latest synthesis-frontend -- --template react
cd synthesis-frontend
npm install
npm install axios react-force-graph-2d
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### `tailwind.config.js`

```js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

### `src/index.css` — replace entirely

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg:           #0f1117;
  --surface:      #1a1d27;
  --surface-2:    #21253a;
  --border:       #2a2d3e;
  --accent:       #6c7ff2;   /* blue-violet from mockup */
  --accent-teal:  #34d4a4;
  --accent-amber: #f5a623;
  --text:         #e8eaf0;
  --muted:        #7c80a0;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', system-ui, sans-serif;
  margin: 0;
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
```

---

## Step 2 — Folder Structure

```
src/
├── api/
│   └── index.js          ← all fetch calls in one place
├── components/
│   ├── Sidebar.jsx
│   ├── Brain.jsx
│   ├── Catalog.jsx
│   ├── Map.jsx
│   └── Reports.jsx       ← NEW
├── App.jsx
└── main.jsx
```

---

## Step 3 — API Layer `src/api/index.js`

```js
import axios from "axios";

const BASE = "http://localhost:8000";

export const brainQuery  = (query, top_k = 8) =>
  axios.post(`${BASE}/api/brain`, { query, top_k }).then(r => r.data);

export const fetchCatalog = (params = {}) =>
  axios.get(`${BASE}/api/catalog`, { params }).then(r => r.data);

export const fetchMap = (query = "") =>
  axios.get(`${BASE}/api/map`, { params: { query } }).then(r => r.data);

// NEW — Reports tab
export const fetchReports = (domain = "") =>
  axios.get(`${BASE}/api/reports`, { params: domain ? { domain } : {} }).then(r => r.data);
```

---

## Step 4 — App Shell `src/App.jsx`

```jsx
import { useState } from "react";
import Sidebar  from "./components/Sidebar";
import Brain    from "./components/Brain";
import Catalog  from "./components/Catalog";
import Map      from "./components/Map";
import Reports  from "./components/Reports";   // NEW

export default function App() {
  const [tab, setTab] = useState("Brain");

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar active={tab} setActive={setTab} />
      <main style={{ flex: 1, overflow: "auto" }}>
        {tab === "Brain"   && <Brain />}
        {tab === "Catalog" && <Catalog />}
        {tab === "Map"     && <Map />}
        {tab === "Reports" && <Reports />}
      </main>
    </div>
  );
}
```

---

## Step 5 — Sidebar `src/components/Sidebar.jsx`

Add the Reports entry to the TABS array:

```jsx
const TABS = [
  { id: "Brain",   icon: "🧠", label: "Brain"   },
  { id: "Catalog", icon: "📚", label: "Catalog" },
  { id: "Map",     icon: "🗺️", label: "Map"     },
  { id: "Reports", icon: "📊", label: "Reports" },  // NEW
];

export default function Sidebar({ active, setActive }) {
  return (
    <aside style={{
      width: 68,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "20px 0",
      gap: 8,
      background: "var(--surface)",
      borderRight: "1px solid var(--border)",
      flexShrink: 0,
    }}>
      {/* Logo mark */}
      <div style={{
        fontSize: 20,
        fontWeight: 700,
        color: "var(--accent)",
        marginBottom: 16,
        letterSpacing: "-1px",
      }}>✦</div>

      {TABS.map(({ id, icon, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            title={label}
            onClick={() => setActive(id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "10px 0",
              width: "100%",
              background: isActive ? "var(--surface-2)" : "transparent",
              border: "none",
              borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              color: isActive ? "var(--accent)" : "var(--muted)",
              fontSize: 10,
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: 20 }}>{icon}</span>
            {label}
          </button>
        );
      })}
    </aside>
  );
}
```

---

## Step 6 — Brain Tab `src/components/Brain.jsx`

*(Unchanged — see original guide)*

---

## Step 7 — Catalog Tab `src/components/Catalog.jsx`

*(Unchanged — see original guide)*

---

## Step 8 — Map Tab `src/components/Map.jsx`

*(Unchanged — see original guide)*

---

## Step 9 — Reports Tab `src/components/Reports.jsx` ✦ NEW

This tab surfaces two tables: **Methodology & Tools Breakdown** and **Adviser Recommendations**, matching the layout in the design mockup.

```jsx
import { useState, useEffect } from "react";
import { fetchReports } from "../api";

// ── shared table styles ───────────────────────────────────
const TABLE = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};
const TH = {
  padding: "10px 16px",
  textAlign: "left",
  color: "var(--muted)",
  fontWeight: 500,
  fontSize: 12,
  borderBottom: "1px solid var(--border)",
};
const TD = {
  padding: "13px 16px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text)",
  verticalAlign: "top",
};

export default function Reports() {
  const [data,     setData]    = useState(null);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState(null);
  const [domain,   setDomain]  = useState("");

  const load = async (d = "") => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchReports(d);
      setData(result);
    } catch {
      setError("Backend unreachable — make sure FastAPI is running on port 8000.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDomainChange = (e) => {
    const val = e.target.value;
    setDomain(val);
    load(val);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>

      {/* ── Header ───────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
            Research Methodology &amp; Adviser Insights
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
            Explore the tools and methodologies used in relevant theses and connect
            with advisers who can guide your research.
          </p>
        </div>

        {/* Domain filter */}
        {data?.domains?.length > 0 && (
          <select
            value={domain}
            onChange={handleDomainChange}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              color: "var(--text)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <option value="">All Domains</option>
            {data.domains.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Error ────────────────────────────────────────── */}
      {error && (
        <div style={{
          background: "#2a1a1a",
          border: "1px solid #5c2d2d",
          borderRadius: 10,
          padding: "14px 18px",
          color: "#f87171",
          fontSize: 13,
          marginBottom: 24,
        }}>
          {error}
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--muted)" }}>
          Building report…
        </div>
      )}

      {/* ── Content ──────────────────────────────────────── */}
      {!loading && data && (
        <>
          {/* 1. Methodology & Tools Breakdown */}
          <Section
            title="1. Methodology & Tools Breakdown"
            subtitle="Key methodologies and tools frequently used in relevant theses."
          >
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 200 }}>Tool / Methodology</th>
                  <th style={TH}>Description</th>
                  <th style={{ ...TH, width: 80, textAlign: "center" }}>Uses</th>
                </tr>
              </thead>
              <tbody>
                {data.methodology_breakdown.map(({ tool, description, count }) => (
                  <tr key={tool}>
                    <td style={{ ...TD, fontWeight: 500, color: "var(--text)" }}>
                      {tool}
                    </td>
                    <td style={{ ...TD, color: "var(--muted)", lineHeight: 1.6 }}>
                      {description || "—"}
                    </td>
                    <td style={{ ...TD, textAlign: "center" }}>
                      <span style={{
                        display: "inline-block",
                        background: "var(--surface-2)",
                        color: "var(--accent)",
                        borderRadius: 20,
                        padding: "2px 10px",
                        fontSize: 12,
                        fontWeight: 500,
                      }}>
                        {count}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.methodology_breakdown.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ ...TD, textAlign: "center", color: "var(--muted)", padding: "32px 0" }}>
                      No methodology data for this domain.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* 2. Adviser Recommendations */}
          <Section
            title="2. Adviser Recommendations"
            subtitle="Advisers who have mentored students in related research areas."
            style={{ marginTop: 32 }}
          >
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={TH}>Name</th>
                  <th style={TH}>Faculty</th>
                  <th style={TH}>Domains</th>
                  <th style={{ ...TH, textAlign: "right" }}>Relevant Theses Mentored</th>
                </tr>
              </thead>
              <tbody>
                {data.adviser_recommendations.map(({ name, faculty, domains, theses_mentored }) => (
                  <tr key={name}>
                    <td style={{ ...TD, fontWeight: 500 }}>{name}</td>
                    <td style={{ ...TD, color: "var(--muted)" }}>{faculty}</td>
                    <td style={TD}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {domains.map(d => (
                          <span key={d} style={{
                            background: "var(--surface-2)",
                            color: "var(--accent-teal)",
                            borderRadius: 20,
                            padding: "2px 8px",
                            fontSize: 11,
                          }}>
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...TD, textAlign: "right", color: "var(--muted)" }}>
                      {theses_mentored} Theses Mentored
                    </td>
                  </tr>
                ))}
                {data.adviser_recommendations.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ ...TD, textAlign: "center", color: "var(--muted)", padding: "32px 0" }}>
                      No adviser data for this domain.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────
function Section({ title, subtitle, children, style = {} }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 24,
      ...style,
    }}>
      <div style={{ padding: "20px 24px 16px" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
        {subtitle && (
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        {children}
      </div>
    </div>
  );
}
```

---

## Step 10 — Start the Frontend

```bash
npm run dev
```

Opens at `http://localhost:5173`

---

## 24-Hour Build Order

Strictly follow this — a working Brain tab at hour 9 is better than a half-finished everything.

| Window | Task |
|---|---|
| **0–2 hrs** | Generate `theses.json` with 20+ records, 3+ domains |
| **2–4 hrs** | Backend: setup → `ingest.py` → verify Qdrant → all 4 routes working |
| **4–5 hrs** | Frontend: Vite scaffold, `index.css`, `App.jsx`, `Sidebar.jsx`, `api/index.js` |
| **5–8 hrs** | **Brain tab** — search bar, GPT output, source cards, loading states |
| **8–10 hrs** | **Catalog tab** — table, filters, empty states |
| **10–13 hrs** | **Map tab** — force graph, cluster/thesis nodes, detail panel |
| **13–15 hrs** | **Reports tab** — two tables, domain filter dropdown |
| **15–18 hrs** | Visual polish across all four tabs |
| **18–21 hrs** | Bug fixes, run the demo script 3 times, prepare talking points |
| **21–24 hrs** | Freeze code. Sleep. One final dry-run on wakeup. |

---

## Demo Script (3 min, practice it twice)

1. **Brain tab** → type `"machine learning for crop disease detection"` → show the four-section GPT output and the source thesis cards below it
2. **Catalog tab** → filter by domain `"Computer Vision"` → show filtered results, then reset and search by keyword `"CNN"`
3. **Map tab** → show the full constellation → click a domain cluster node → click an individual thesis node to open the detail panel → type a topic in the filter bar to narrow the map
4. **Reports tab** → show the full Methodology & Tools table with GPT-generated descriptions → scroll down to Adviser Recommendations → switch the domain filter to `"Computer Vision"` to show scoped results

---

## Pre-Demo Checklist

- [ ] Backend on `localhost:8000`, frontend on `localhost:5173`
- [ ] Brain query returns a structured four-section response with sources
- [ ] Catalog loads all theses; domain filter and keyword search both work
- [ ] Map renders cluster and thesis nodes; clicking either shows the detail panel
- [ ] Reports loads both tables without errors
- [ ] Reports domain filter updates both tables correctly
- [ ] No red console errors on any tab
- [ ] Demo script rehearsed end-to-end at least twice
