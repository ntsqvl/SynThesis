import { useEffect, useMemo, useRef, useState } from "react";
import { brainQuery } from "../api/index.js";
import BrainConstellation from "./BrainConstellation.jsx";

const DEFAULT_SECTIONS = ["What's Been Studied", "Gap Report", "Recommended Methods & Tools"];

const EXAMPLES = [
  "machine learning for crop disease detection",
  "CNN-based document classification",
  "mobile learning analytics for senior high school"
];

const EMPTY_SESSION = {
  query: "",
  submittedQuery: "",
  payload: null,
  history: [],
  messages: [],
  activeCitation: null
};

export default function Brain({ session = EMPTY_SESSION, setSession, onBrainResult, onBrainClear }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const chatEndRef = useRef(null);

  const safeSession = { ...EMPTY_SESSION, ...(session || {}) };
  const messages = Array.isArray(safeSession.messages) ? safeSession.messages : [];
  const latestAssistant = useMemo(() => [...messages].reverse().find((message) => message.role === "assistant"), [messages]);
  const latestSources = latestAssistant?.sources || [];
  const latestQuery = safeSession.submittedQuery || latestAssistant?.query || "";
  const latestConfidence = latestAssistant?.confidence ?? safeSession.payload?.confidence ?? null;
  const latestRepositoryConfidence = latestAssistant?.repositoryConfidence ?? safeSession.payload?.repository_confidence ?? null;
  const activeCitation = safeSession.activeCitation;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading, error]);

  const updateSession = (patchOrUpdater) => {
    setSession((current) => {
      const base = { ...EMPTY_SESSION, ...(current || {}) };
      const patch = typeof patchOrUpdater === "function" ? patchOrUpdater(base) : patchOrUpdater;
      return { ...base, ...patch };
    });
  };

  const runQuery = async (submittedQuery = safeSession.query) => {
    const cleanQuery = String(submittedQuery || "").trim();
    if (!cleanQuery || loading) return;

    const historyForRequest = Array.isArray(safeSession.history) ? safeSession.history : [];
    const createdAt = Date.now();
    const userMessage = {
      id: `user-${createdAt}`,
      role: "user",
      content: cleanQuery,
      query: cleanQuery,
      createdAt
    };

    updateSession((current) => ({
      query: cleanQuery,
      submittedQuery: cleanQuery,
      activeCitation: null,
      messages: [...(current.messages || []), userMessage]
    }));

    setLoading(true);
    setError(null);

    try {
      const result = await brainQuery(cleanQuery, 8, historyForRequest);
      const normalized = normalizeBrainPayload(result);
      const answerText = String(result?.answer ?? result?.response ?? result?.result ?? "");
      const adviserRanking = normalizeAdviserRanking(result?.adviser_ranking || result?.adviserRanking || []);
      const assistantMessage = {
        id: `assistant-${createdAt}`,
        role: "assistant",
        content: answerText,
        query: cleanQuery,
        sections: normalized.sections,
        sources: normalized.sources,
        confidence: normalized.confidence,
        repositoryConfidence: normalized.repositoryConfidence,
        adviserRanking,
        warning: result?.warning || "",
        createdAt: Date.now()
      };

      updateSession((current) => ({
        payload: result,
        history: Array.isArray(result?.history)
          ? result.history
          : [
              ...(historyForRequest || []),
              { role: "user", content: cleanQuery },
              { role: "assistant", content: answerText }
            ],
        messages: [...(current.messages || []), assistantMessage],
        submittedQuery: cleanQuery,
        activeCitation: null
      }));

      onBrainResult?.({
        query: cleanQuery,
        sources: normalized.sources,
        adviserRanking,
        confidence: normalized.confidence,
        repositoryConfidence: normalized.repositoryConfidence
      });
    } catch (requestError) {
      setError(
        requestError?.response?.data?.detail ||
          "Backend unreachable. Start FastAPI on port 8000, then retry the query."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    runQuery();
  };

  const clearConversation = () => {
    setError(null);
    setLoading(false);
    setSession({ ...EMPTY_SESSION });
    onBrainClear?.();
  };

  const handleCitationClick = (citationNumber, sources, message) => {
    const source = sources?.[citationNumber - 1];
    if (!source) return;
    updateSession({
      activeCitation: {
        citationNumber,
        source,
        messageId: message?.id,
        query: message?.query || latestQuery,
        title: source.title || "Repository record"
      }
    });
  };

  return (
    <div className="page brain-page">
      <div className="brain-workspace">
        <section className="card brain-chat-panel" aria-label="SynThesis conversation">
          <div className="brain-chat-header">
            <div>
              <p className="eyebrow">SynThesis Brain</p>
              <h1>Ask the research corpus with cited evidence.</h1>
              <p className="lede">
                Chat with SynThesis. Answers cite repository theses and faculty research; click a citation to inspect it on the right.
              </p>
            </div>
            <div className="brain-header-badges">
              {latestConfidence !== null && latestConfidence !== undefined && <ConfidenceBadge value={latestConfidence} />}
              {latestRepositoryConfidence?.label && <span className="badge info">{latestRepositoryConfidence.label}</span>}
            </div>
          </div>

          <div className="chat-thread" aria-label="Conversation history">
            {messages.length === 0 && !loading && !error && <EmptyChat runQuery={runQuery} disabled={loading} />}

            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onCitationClick={handleCitationClick}
              />
            ))}

            {loading && (
              <div className="chat-message assistant">
                <div className="message-avatar">S</div>
                <div className="message-bubble assistant-bubble typing-bubble">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-text">Building a cited answer from the repository.</span>
                </div>
              </div>
            )}

            {error && <div className="status error">{error}</div>}
            {safeSession.payload?.warning && !loading && !error && (
              <div className="status">{safeSession.payload.warning}</div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="chat-composer" aria-label="Brain query form">
            <textarea
              className="textarea chat-input"
              value={safeSession.query || ""}
              onChange={(event) => updateSession({ query: event.target.value })}
              placeholder="Ask about a topic, method, dataset, or unexplored thesis angle."
            />
            <div className="composer-footer">
              <div className="toolbar example-row" aria-label="Example queries">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="button secondary compact-button"
                    onClick={() => runQuery(example)}
                    disabled={loading}
                  >
                    {example}
                  </button>
                ))}
              </div>
              <div className="toolbar composer-actions">
                {messages.length > 0 && (
                  <button className="button secondary" type="button" disabled={loading} onClick={clearConversation}>
                    Clear chat
                  </button>
                )}
                <button className="button" type="submit" disabled={loading || !String(safeSession.query || "").trim()}>
                  {loading ? "Synthesizing" : messages.length > 0 ? "Send" : "Run synthesis"}
                </button>
              </div>
            </div>
          </form>
        </section>

        <aside className="brain-side-panel" aria-label="Brain map and selected study details">
          {activeCitation?.source ? (
            <StudyDetail citation={activeCitation} onBack={() => updateSession({ activeCitation: null })} />
          ) : latestQuery ? (
            <BrainConstellation
              query={latestQuery}
              sources={latestSources}
              activeSource={null}
              onSourceSelect={(citationNumber) => {
                const source = latestSources?.[citationNumber - 1];
                if (!source) return;
                updateSession({
                  activeCitation: {
                    citationNumber,
                    source,
                    messageId: latestAssistant?.id,
                    query: latestQuery,
                    title: source.title || "Repository record"
                  }
                });
              }}
              compact
            />
          ) : (
            <BrainMapPlaceholder />
          )}
        </aside>
      </div>
    </div>
  );
}

function EmptyChat({ runQuery, disabled }) {
  return (
    <div className="empty-chat-card">
      <p className="eyebrow">Start with a research question</p>
      <h2>SynThesis will answer in three evidence blocks.</h2>
      <div className="starter-section-grid">
        {DEFAULT_SECTIONS.map((title, index) => (
          <div key={title} className="starter-section">
            <span className="kicker">Block {index + 1}</span>
            <h3>{title}</h3>
            <p>{starterCopy(title)}</p>
          </div>
        ))}
      </div>
      <div className="toolbar" style={{ marginTop: 18 }}>
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="button secondary compact-button" onClick={() => runQuery(example)} disabled={disabled}>
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function starterCopy(title) {
  if (title === "What's Been Studied") return "A short view of related theses and faculty research already in the repository.";
  if (title === "Gap Report") return "Concrete gaps or underexplored angles from the repository evidence.";
  return "Methods, tools, datasets, and evaluation ideas grounded in cited records.";
}

function ChatMessage({ message, onCitationClick }) {
  if (message.role === "user") {
    return (
      <div className="chat-message user">
        <div className="message-bubble user-bubble">{message.content}</div>
        <div className="message-avatar user-avatar">You</div>
      </div>
    );
  }

  const sources = Array.isArray(message.sources) ? message.sources : [];
  const sections = Array.isArray(message.sections) && message.sections.length > 0
    ? message.sections
    : normalizeSections(message.content);

  return (
    <div className="chat-message assistant">
      <div className="message-avatar">S</div>
      <div className="message-bubble assistant-bubble">
        {message.warning && <div className="status compact-status">{message.warning}</div>}
        {message.confidence !== null && message.confidence !== undefined && (
          <div className="meta-row message-meta">
            <ConfidenceBadge value={message.confidence} />
            {sources.length > 0 && <span className="badge">{sources.length} repository records</span>}
          </div>
        )}
        <div className="assistant-sections">
          {sections.length > 0 ? (
            sections.map((section, index) => (
              <AnswerSection
                key={`${message.id}-${section.title}-${index}`}
                title={section.title || DEFAULT_SECTIONS[index] || `Section ${index + 1}`}
                content={section.content}
                index={index}
                sources={sources}
                message={message}
                onCitationClick={onCitationClick}
              />
            ))
          ) : (
            <p>{renderWithCitations(message.content, sources, message, onCitationClick)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ value }) {
  const numeric = Number(value);
  const normalizedValue = Number.isFinite(numeric)
    ? numeric <= 1
      ? Math.round(numeric * 100)
      : Math.round(numeric)
    : null;
  const label = normalizedValue !== null ? `${normalizedValue}% repository confidence` : String(value);

  return <span className="badge success">{label}</span>;
}

function AnswerSection({ title, content, index, sources, message, onCitationClick }) {
  const blocks = normalizeContentBlocks(content);

  return (
    <article className="answer-section chat-answer-section">
      <span className="kicker">{DEFAULT_SECTIONS.includes(title) ? title : `Section ${index + 1}`}</span>
      {!DEFAULT_SECTIONS.includes(title) && <h3>{title}</h3>}
      {blocks.length === 0 ? (
        <p>No content returned for this section.</p>
      ) : (
        blocks.map((block, blockIndex) => {
          if (Array.isArray(block)) {
            return (
              <ul key={blockIndex}>
                {block.map((item, itemIndex) => (
                  <li key={`${blockIndex}-${itemIndex}`}>{renderWithCitations(item, sources, message, onCitationClick)}</li>
                ))}
              </ul>
            );
          }

          return <p key={blockIndex}>{renderWithCitations(block, sources, message, onCitationClick)}</p>;
        })
      )}
    </article>
  );
}

function StudyDetail({ citation, onBack }) {
  const source = citation.source || {};
  const methods = toArray(source.methodology || source.method || source.research_design);
  const tools = toArray(source.tools || source.tool || source.frameworks || source.software);
  const keywords = toArray(source.keywords || source.tags || source.topics);
  const datasets = toArray(source.datasets || source.dataset);
  const people = source.proponentsText || peopleText(source.proponents) || source.author || source.authors || "";
  const adviser = source.supervisorLabel || source.adviser || source.advisor || source.mentor || source.adviser_or_faculty || "";
  const typeLabel = formatRecordType(source.recordKind || source.record_kind || source.recordType || source.type || "Repository record");

  return (
    <section className="card study-detail-card">
      <div className="study-detail-header">
        <button type="button" className="button secondary" onClick={onBack}>
          Back to map
        </button>
        <span className="citation-chip">[{citation.citationNumber}]</span>
      </div>
      <div className="study-detail-body">
        <p className="eyebrow">Cited repository record</p>
        <h2>{source.title || citation.title || "Untitled repository record"}</h2>
        <div className="meta-row" style={{ marginTop: 14 }}>
          <span className="badge info">{typeLabel}</span>
          {source.domain && <span className="badge accent">{source.domain}</span>}
          {source.year && <span className="badge">{source.year}</span>}
          {source.repositoryVerified !== false && source.repository_verified !== false && <span className="badge success">In repository</span>}
        </div>

        <div className="detail-list study-detail-list">
          <DetailItem label="Proponents / authors" value={people} />
          <DetailItem label="Adviser / faculty" value={adviser} />
          <DetailItem label="Publication" value={source.publication} />
          <DetailItem label="DOI" value={source.doi} />
          <DetailChips label="Methods" values={methods} accent />
          <DetailChips label="Tools" values={tools.filter((tool) => !methods.includes(tool))} />
          <DetailChips label="Datasets" values={datasets} />
          <DetailChips label="Keywords" values={keywords} />
          <DetailItem label="Abstract / summary" value={source.abstract || source.summary || source.description} />
        </div>
      </div>
    </section>
  );
}

function DetailItem({ label, value }) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{String(value)}</span>
    </div>
  );
}

function DetailChips({ label, values, accent = false }) {
  const cleanValues = [...new Set(toArray(values))];
  if (cleanValues.length === 0) return null;
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <div className="meta-row">
        {cleanValues.map((value) => (
          <span key={value} className={`badge${accent ? " accent" : ""}`}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function BrainMapPlaceholder() {
  return (
    <section className="card brain-map-placeholder">
      <p className="eyebrow">Knowledge map</p>
      <h2>Your query map will appear here.</h2>
      <p className="lede">
        After you ask SynThesis, the related repository graph stays on this side. Clicking an answer citation replaces the map with the selected study details.
      </p>
      <div className="placeholder-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function normalizeBrainPayload(payload) {
  if (!payload) {
    return { sections: [], sources: [], confidence: null, repositoryConfidence: null };
  }

  const answer = payload.answer ?? payload.response ?? payload.result ?? payload.synthesis ?? payload;
  const sections = normalizeSections(answer, payload.sections);
  const sources = normalizeSources(payload.sources ?? payload.theses ?? payload.results ?? payload.matches ?? []);
  const repositoryConfidence = payload.repository_confidence || payload.repositoryConfidence || null;
  const confidence = payload.confidence ?? repositoryConfidence?.score ?? payload.alignment_confidence ?? payload.alignment ?? null;

  return { sections, sources, confidence, repositoryConfidence };
}

function normalizeSections(answer, explicitSections) {
  if (Array.isArray(explicitSections)) {
    return explicitSections.map((section, index) => ({
      title: normalizeSectionTitle(section.title || section.heading || DEFAULT_SECTIONS[index] || `Section ${index + 1}`),
      content: section.content || section.body || section.text || section.items || ""
    }));
  }

  if (typeof answer === "string") {
    return parseMarkdownLikeSections(answer);
  }

  if (answer && typeof answer === "object") {
    const preferredKeys = [
      ["whats_been_studied", "What's Been Studied"],
      ["what_has_been_studied", "What's Been Studied"],
      ["studied", "What's Been Studied"],
      ["research_landscape", "What's Been Studied"],
      ["overview", "What's Been Studied"],
      ["gap_report", "Gap Report"],
      ["research_gaps", "Gap Report"],
      ["gaps", "Gap Report"],
      ["recommended_methods_tools", "Recommended Methods & Tools"],
      ["recommended_methods_and_tools", "Recommended Methods & Tools"],
      ["methods_tools", "Recommended Methods & Tools"],
      ["recommendations", "Recommended Methods & Tools"]
    ];

    const mapped = preferredKeys
      .filter(([key]) => answer[key])
      .map(([key, title]) => ({ title, content: answer[key] }));

    if (mapped.length > 0) return mapped;

    return Object.entries(answer)
      .filter(([, value]) => typeof value !== "object" || Array.isArray(value))
      .map(([key, value]) => ({ title: normalizeSectionTitle(titleCase(key)), content: value }));
  }

  return [];
}

function parseMarkdownLikeSections(text) {
  const lines = String(text || "").split(/\r?\n/);
  const sections = [];
  let current = { title: "Synthesis", content: [] };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (headingMatch) {
      if (current.content.length > 0) sections.push(current);
      current = { title: normalizeSectionTitle(headingMatch[1].trim()), content: [] };
    } else if (line.trim()) {
      current.content.push(line.trim());
    }
  }

  if (current.content.length > 0) sections.push(current);

  if (sections.length === 0) {
    return text ? [{ title: "Synthesis", content: text }] : [];
  }

  return sections.map((section) => ({ ...section, content: section.content.join("\n") }));
}

function normalizeSectionTitle(title) {
  const cleanTitle = String(title || "").replace(/[*_`#]/g, "").trim();
  const normalized = cleanTitle.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
  if (["whats been studied", "what s been studied", "what has been studied", "research landscape", "studied"].includes(normalized)) {
    return "What's Been Studied";
  }
  if (["gap report", "research gaps", "gaps"].includes(normalized)) return "Gap Report";
  if (["recommended methods and tools", "methods and tools", "recommended tools", "recommended methods tools"].includes(normalized)) {
    return "Recommended Methods & Tools";
  }
  return cleanTitle || "Synthesis";
}

function normalizeContentBlocks(content) {
  if (!content) return [];
  if (Array.isArray(content)) {
    return [content.map((item) => (typeof item === "string" ? item : JSON.stringify(item)))];
  }

  return String(content)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
      const isList = lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line));
      return isList ? lines.map((line) => line.replace(/^[-*]\s+/, "")) : lines.join(" ");
    });
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];

  return sources.map((source, index) => {
    const thesis = source.thesis || source.metadata || source.data || source;
    const proponents = peopleFromFields(
      thesis.proponents || thesis.proponent || thesis.proponents_text || thesis.authors || thesis.author || thesis.student || thesis.students
    );

    return {
      ...thesis,
      id: thesis.id || thesis.thesis_id || source.id || index + 1,
      type: thesis.type || thesis.record_type || thesis.recordKind || thesis.record_kind || source.type || "",
      recordType: thesis.type || thesis.record_type || source.type || "",
      recordKind: thesis.record_kind || thesis.recordKind || (thesis.type === "faculty_paper" ? "Faculty research" : "Thesis"),
      title: thesis.title || thesis.name || source.title || "Untitled repository record",
      author: proponents.text || thesis.author || thesis.authors || thesis.student || "",
      proponents: proponents.list,
      proponentsText: thesis.proponents_text || proponents.text,
      adviser: thesis.adviser || thesis.advisor || thesis.mentor || thesis.adviser_or_faculty || (thesis.type === "faculty_paper" ? firstAuthor(thesis.author) : ""),
      supervisorLabel: thesis.supervisor_label || supervisorLabel(thesis),
      domain: thesis.domain || thesis.category || thesis.cluster || "",
      year: thesis.year || thesis.publication_year || thesis.school_year || "",
      summary: thesis.summary || thesis.abstract || source.snippet || source.text || "",
      abstract: thesis.abstract || thesis.summary || source.snippet || source.text || "",
      methodology: thesis.methodology || thesis.method || thesis.research_design || [],
      tools: thesis.tools || thesis.tool || thesis.frameworks || thesis.software || thesis.methodology || [],
      keywords: thesis.keywords || thesis.tags || thesis.topics || [],
      datasets: thesis.datasets || thesis.dataset || [],
      publication: thesis.publication || "",
      doi: thesis.doi || "",
      score: source.score || thesis.score,
      repositoryVerified: thesis.repository_verified ?? thesis.repositoryVerified ?? true
    };
  });
}

function renderWithCitations(text, sources, message, onCitationClick) {
  const parts = String(text || "").split(/(\[\d+\])/g);

  return parts.map((part, index) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (!match) return <span key={`${part}-${index}`}>{part}</span>;

    const citationNumber = Number(match[1]);
    const valid = citationNumber >= 1 && citationNumber <= (sources?.length || 0);
    return (
      <button
        key={`${part}-${index}`}
        type="button"
        className={`citation-chip${valid ? "" : " disabled"}`}
        onClick={() => valid && onCitationClick?.(citationNumber, sources, message)}
        aria-label={valid ? `Open cited study ${citationNumber}` : `Citation ${citationNumber} was not returned as a source`}
        disabled={!valid}
      >
        {part}
      </button>
    );
  });
}

function normalizeAdviserRanking(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    adviser: item.adviser || item.name || item.advisor || item.faculty_name || "Unnamed adviser",
    name: item.name || item.adviser || item.advisor || item.faculty_name || "Unnamed adviser",
    alignment_score: item.alignment_score ?? item.alignmentScore ?? item.score ?? 0,
    relevant_theses: toArray(item.relevant_theses || item.relevantTheses || item.works || item.theses),
    domains: toArray(item.domains || item.domain)
  }));
}

function supervisorLabel(thesis) {
  if (thesis.supervisor_label) return thesis.supervisor_label;
  if (thesis.type === "faculty_paper") return `Faculty: ${firstAuthor(thesis.author)}`;
  const adviser = thesis.adviser || thesis.advisor || thesis.mentor;
  return adviser ? `Adviser: ${adviser}` : "";
}

function peopleFromFields(value) {
  if (!value) return { list: [], text: "" };
  if (Array.isArray(value)) {
    const list = value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
    return { list, text: list.join(", ") };
  }
  const text = String(value).trim();
  return { list: text ? [text] : [], text };
}

function peopleText(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join(", ");
  return String(value).trim();
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    return value
      .split(/[,;|]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

function firstAuthor(author) {
  return String(author || "")
    .split(",")
    .map((part) => part.trim())
    .find(Boolean) || "Unknown faculty";
}

function formatRecordType(type) {
  return titleCase(String(type || "").replace(/_/g, " "));
}

function titleCase(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
