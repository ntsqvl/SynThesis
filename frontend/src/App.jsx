import { useCallback, useEffect, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import { SynthesisPage } from "./features/synthesis/index.js";
import Catalog from "./components/Catalog.jsx";
import Reports from "./components/Reports.jsx";

const BRAIN_SESSION_KEY = "synthesis.brainSession.v2";
const BRAIN_CONTEXT_KEY = "synthesis.brainContext.v2";

const EMPTY_BRAIN_SESSION = {
  query: "",
  submittedQuery: "",
  payload: null,
  history: [],
  messages: [],
  activeCitation: null
};

const EMPTY_BRAIN_CONTEXT = {
  query: "",
  sources: [],
  citedSourceIds: [],
  adviserRanking: [],
  confidence: null,
  repositoryConfidence: null,
  updatedAt: null
};

export default function App() {
  const [tab, setTab] = useState("Brain");
  const [brainSession, setBrainSession] = useState(() => readStored(BRAIN_SESSION_KEY, EMPTY_BRAIN_SESSION));
  const [brainContext, setBrainContext] = useState(() => readStored(BRAIN_CONTEXT_KEY, EMPTY_BRAIN_CONTEXT));

  useEffect(() => {
    writeStored(BRAIN_SESSION_KEY, brainSession);
  }, [brainSession]);

  useEffect(() => {
    writeStored(BRAIN_CONTEXT_KEY, brainContext);
  }, [brainContext]);

  const handleBrainResult = useCallback((nextContext) => {
    setBrainContext({
      query: nextContext.query || "",
      sources: Array.isArray(nextContext.sources) ? nextContext.sources : [],
      citedSourceIds: Array.isArray(nextContext.citedSourceIds) ? nextContext.citedSourceIds : [],
      adviserRanking: Array.isArray(nextContext.adviserRanking) ? nextContext.adviserRanking : [],
      confidence: nextContext.confidence ?? null,
      repositoryConfidence: nextContext.repositoryConfidence ?? null,
      updatedAt: Date.now()
    });
  }, []);

  const handleBrainClear = useCallback(() => {
    setBrainContext(EMPTY_BRAIN_CONTEXT);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar active={tab} setActive={setTab} />
      <main className="main-panel" aria-live="polite">
        {tab === "Brain" && (
          <SynthesisPage
            session={brainSession}
            setSession={setBrainSession}
            onBrainResult={handleBrainResult}
            onBrainClear={handleBrainClear}
            onOpenReports={() => setTab("Reports")}
          />
        )}
        {tab === "Catalog" && <Catalog brainContext={brainContext} />}
        {tab === "Reports" && <Reports brainContext={brainContext} />}
      </main>
    </div>
  );
}

function readStored(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota and private browsing failures.
  }
}
