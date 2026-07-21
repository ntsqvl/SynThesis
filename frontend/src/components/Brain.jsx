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

export default function Brain({ session = EMPTY_SESSION, setSession, onBrainResult, onBrainClear, onOpenReports }) {
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
      const timeoutMessage =
        "The backend took too long to answer this follow-up. Retry the query or shorten it.";
      const fallbackMessage =
        "Backend unreachable. Start FastAPI on port 8000, then retry the query.";
      setError(
        requestError?.code === "ECONNABORTED" || String(requestError?.message || "").toLowerCase().includes("timeout")
          ? timeoutMessage
          : requestError?.response?.data?.detail || fallbackMessage
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
                onOpenReports={onOpenReports}
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

function ChatMessage({ message, onCitationClick, onOpenReports }) {
  if (message.role === "user") {
    return (
      <div className="chat-message user">
        <div className="message-bubble user-bubble">{message.content}</div>
        <div className="message-avatar user-avatar">You</div>
      </div>
    );
  }

  const sources = Array.isArray(message.sources) ? message.sources : [];
  const parsedContentSections = typeof message.content === "string" ? normalizeSections(message.content) : [];
  const sections = parsedContentSections.length > 0
    ? parsedContentSections
    : Array.isArray(message.sections) && message.sections.length > 0
      ? message.sections
      : [];

  return (
    <div className="chat-message assistant">
      <div className="message-avatar">S</div>
      <div className="message-bubble assistant-bubble">
        {message.warning && <div className="status compact-status">{message.warning}</div>}
        {message.confidence !== null && message.confidence !== undefined && (
          <div className="meta-row message-meta">
            <ConfidenceBadge value={message.confidence} />
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
                onOpenReports={onOpenReports}
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

function AnswerSection({ title, content, index, sources, message, onCitationClick, onOpenReports }) {
  const blocks = normalizeContentBlocks(content);
  const sectionTitle = normalizeSectionTitle(title);
  const isReportLink = sectionTitle === "Recommended Methods & Tools" && typeof onOpenReports === "function";
  const openReports = () => {
    if (isReportLink) onOpenReports();
  };

  return (
    <article
      className={`answer-section chat-answer-section${isReportLink ? " report-link-card" : ""}`}
      role={isReportLink ? "button" : undefined}
      tabIndex={isReportLink ? 0 : undefined}
      onClick={openReports}
      onKeyDown={(event) => {
        if (!isReportLink) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openReports();
        }
      }}
      aria-label={isReportLink ? "Open the Reports tab for complete methodology and tools details" : undefined}
    >
      <div className="section-title-row">
        <span className="kicker">{DEFAULT_SECTIONS.includes(sectionTitle) ? sectionTitle : `Section ${index + 1}`}</span>
        {isReportLink && <span className="badge accent report-link-badge">Open full report</span>}
      </div>
      {!DEFAULT_SECTIONS.includes(sectionTitle) && <h3>{title}</h3>}
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
  const adviser = source.mentor || source.adviser || "";
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

  const flushCurrent = () => {
    const content = current.content.join("\n").trim();
    if (content || DEFAULT_SECTIONS.includes(normalizeSectionTitle(current.title))) {
      sections.push({ title: normalizeSectionTitle(current.title), content });
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (current.content.length > 0 && current.content[current.content.length - 1] !== "") {
        current.content.push("");
      }
      continue;
    }

    const heading = extractKnownSectionHeading(line);

    if (heading) {
      flushCurrent();
      current = { title: heading.title, content: [] };
      if (heading.inlineContent) current.content.push(heading.inlineContent);
      continue;
    }

    current.content.push(line);
  }

  flushCurrent();

  const meaningfulSections = sections.filter((section) => section.content || section.title !== "Synthesis");
  if (meaningfulSections.length === 0) {
    return text ? [{ title: "Synthesis", content: text }] : [];
  }

  return meaningfulSections;
}

function extractKnownSectionHeading(line) {
  if (!line) return null;

  let normalizedLine = line
    .replace(/^#{1,6}\s*/, "")
    .replace(/\s*#{1,6}$/, "")
    .trim();

  const boldHeading = normalizedLine.match(/^\*\*(.+?)\*\*:?[ \t]*(.*)$/);
  if (boldHeading) {
    const boldTitle = boldHeading[1].replace(/[:\-–]\s*$/, "").trim();
    normalizedLine = `${boldTitle}${boldHeading[2] ? `: ${boldHeading[2]}` : ""}`.trim();
  }

  const match = normalizedLine.match(
    /^(?:\d+[.)]\s*)?(?:\*\*)?\s*(what(?:'|’)s been studied|what has been studied|gap report|recommended methods(?:\s*&\s*|\s+and\s+|\s+)tools)\s*(?:\*\*)?\s*[:\-–]?\s*(.*)$/i
  );

  if (!match) return null;

  const title = normalizeSectionTitle(match[1]);
  if (!DEFAULT_SECTIONS.includes(title)) return null;

  return {
    title,
    inlineContent: String(match[2] || "").trim()
  };
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

  const blocks = [];
  for (const segment of String(content).split(/\n{2,}/)) {
    const lines = segment.split(/\n/).map((line) => line.trim()).filter(Boolean);
    let textLines = [];
    let listItems = [];

    const flushText = () => {
      if (textLines.length > 0) {
        blocks.push(textLines.join(" "));
        textLines = [];
      }
    };

    const flushList = () => {
      if (listItems.length > 0) {
        blocks.push([...listItems]);
        listItems = [];
      }
    };

    for (const line of lines) {
      const listMatch = line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
      if (listMatch) {
        flushText();
        listItems.push(listMatch[1]);
      } else {
        flushList();
        textLines.push(line);
      }
    }

    flushText();
    flushList();
  }

  return blocks;
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
      adviser: thesis.mentor || thesis.adviser || thesis.advisor || "",
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
  const parts = String(text || "").split(/(\[(?:\d+\s*(?:,\s*\d+\s*)*)\])/g);

  return parts.map((part, index) => {
    const match = part.match(/^\[((?:\d+\s*(?:,\s*\d+\s*)*))\]$/);
    if (!match) return <span key={`${part}-${index}`}>{part}</span>;

    const citationNumbers = match[1]
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value));

    return (
      <span key={`${part}-${index}`} className="citation-group">
        {citationNumbers.map((citationNumber, citationIndex) => {
          const valid = citationNumber >= 1 && citationNumber <= (sources?.length || 0);
          return (
            <button
              key={`${part}-${citationNumber}-${citationIndex}`}
              type="button"
              className={`citation-chip${valid ? "" : " disabled"}`}
              onClick={(event) => {
                event.stopPropagation();
                if (valid) onCitationClick?.(citationNumber, sources, message);
              }}
              aria-label={valid ? `Open cited study ${citationNumber}` : `Citation ${citationNumber} was not returned as a source`}
              disabled={!valid}
            >
              [{citationNumber}]
            </button>
          );
        })}
      </span>
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
