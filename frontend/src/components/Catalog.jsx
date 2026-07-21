import { useMemo, useState } from "react";

export default function Catalog({ brainContext = {} }) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");

  const brainQuery = String(brainContext?.query || "").trim();
  const hasBrainSearch = Boolean(brainQuery);
  const catalog = useMemo(() => normalizeCatalogPayload({ theses: brainContext?.sources || [] }), [brainContext?.sources]);
  const items = catalog.items;
  const domains = catalog.domains;

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();

    return items.filter((item) => {
      const matchesDomain = !domain || item.domain === domain;
      const haystack = [
        item.title,
        item.author,
        item.proponentsText,
        item.proponents?.join(" "),
        item.adviser,
        item.domain,
        item.year,
        item.abstract,
        item.methodology,
        item.tools?.join(" "),
        item.keywords?.join(" ")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !search || haystack.includes(search);
      return matchesDomain && matchesSearch;
    });
  }, [items, query, domain]);

  const resetFilters = () => {
    setQuery("");
    setDomain("");
  };

  return (
    <div className="page wide">
      <header className="page-header">
        <div className="header-copy">
          <p className="eyebrow">Research catalog</p>
          <h1>Studies related to the latest Brain search.</h1>
          <p className="lede">
            The catalog now narrows to repository records cited or retrieved by SynThesis in the Brain tab.
          </p>
          {brainQuery && (
            <p className="lede catalog-context-line">
              Showing records related to: <strong>{brainQuery}</strong>
            </p>
          )}
        </div>
        <span className="badge accent">{filteredItems.length} visible</span>
      </header>

      {!hasBrainSearch ? (
        <section className="card empty-state-card">
          <div className="card-body">
            <p className="eyebrow">No Brain search yet</p>
            <h2>Ask SynThesis first to populate this catalog.</h2>
            <p className="lede">
              Once a Brain query returns cited theses or faculty research, only those related records will appear here.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="card-body">
              <div className="catalog-controls">
                <input
                  className="input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter within Brain-related records by title, method, adviser, or keyword"
                  aria-label="Search related catalog records"
                />
                <select
                  className="select"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  aria-label="Filter by domain"
                >
                  <option value="">All domains</option>
                  {domains.map((domainName) => (
                    <option key={domainName} value={domainName}>
                      {domainName}
                    </option>
                  ))}
                </select>
                <button type="button" className="button secondary" onClick={resetFilters}>
                  Reset
                </button>
              </div>
            </div>
          </section>

          <div style={{ height: 18 }} />

          <section className="card">
            <div className="card-header">
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <div>
                  <h2>Brain-related study index</h2>
                  <p className="lede" style={{ marginTop: 4 }}>
                    These are the theses and faculty research records returned for the latest Brain conversation.
                  </p>
                </div>
                <span className="badge">{items.length} related records</span>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table catalog-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 280 }}>Title</th>
                    <th style={{ minWidth: 260 }}>Proponents / authors</th>
                    <th>Domain</th>
                    <th>Methodology</th>
                    <th>Tools</th>
                    <th>Adviser / faculty</th>
                    <th style={{ textAlign: "right" }}>Year</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id || `${item.title}-${item.year}`}>
                      <td>
                        <div style={{ display: "grid", gap: 6 }}>
                          <strong>{item.title || "Untitled thesis"}</strong>
                          <span style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}>
                            {item.abstract || item.summary || "No abstract available."}
                          </span>
                          {(item.type || item.keywords.length > 0) && (
                            <div className="meta-row">
                              {item.type && <span className="badge">{formatRecordType(item.recordKind || item.type)}</span>}
                              {item.keywords.slice(0, 4).map((keyword) => (
                                <span key={keyword} className="badge">
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}>
                        {item.proponentsText ? (
                          <span className="proponent-text">{item.proponentsText}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>-</span>
                        )}
                      </td>
                      <td>{item.domain ? <span className="badge info">{item.domain}</span> : "-"}</td>
                      <td style={{ color: "var(--text-secondary)", minWidth: 180 }}>{item.methodology || "-"}</td>
                      <td>
                        <div className="meta-row">
                          {item.tools.length > 0 ? (
                            item.tools.slice(0, 4).map((tool) => (
                              <span key={tool} className="badge accent">
                                {tool}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>-</span>
                          )}
                        </div>
                      </td>
                      <td style={{ color: "var(--text-secondary)", minWidth: 160 }}>{item.adviser || "-"}</td>
                      <td style={{ textAlign: "right", color: "var(--text-secondary)" }}>{item.year || "-"}</td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)" }}>
                        No related records match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function normalizeCatalogPayload(payload) {
  const rawItems = Array.isArray(payload)
    ? payload
    : payload?.theses || payload?.items || payload?.results || payload?.catalog || [];

  const items = Array.isArray(rawItems) ? rawItems.map(normalizeCatalogItem) : [];
  const payloadDomains = Array.isArray(payload?.domains) ? payload.domains : [];
  const derivedDomains = [...new Set(items.map((item) => item.domain).filter(Boolean))].sort();

  return {
    items,
    domains: payloadDomains.length > 0 ? payloadDomains : derivedDomains
  };
}

function normalizeCatalogItem(item, index) {
  const methodologyList = toArray(item.methodology || item.method || item.research_design);
  const tools = unique([...toArray(item.tools || item.tool || item.frameworks || item.software), ...methodologyList]);
  const keywords = toArray(item.keywords || item.tags || item.topics);
  const proponents = peopleFromFields(
    item.proponentsText || item.proponents_text || item.proponents || item.proponent || item.authors || item.author || item.student || item.students
  );

  return {
    id: item.id || item.thesis_id || index + 1,
    type: item.type || item.record_type || "",
    recordKind: item.recordKind || item.record_kind || (item.type === "faculty_paper" ? "Faculty research" : item.type),
    title: item.title || item.name || "Untitled thesis",
    author: proponents.text || item.author || item.authors || item.student || "",
    proponents: proponents.list,
    proponentsText: proponents.text,
    adviser: item.mentor || item.adviser || item.advisor || "",
    domain: item.domain || item.category || item.cluster || "",
    year: item.year || item.publication_year || item.school_year || "",
    abstract: item.abstract || item.summary || item.description || "",
    summary: item.summary || "",
    methodology: methodologyList.join(", "),
    tools,
    keywords
  };
}

function formatRecordType(type) {
  return String(type || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function firstAuthor(author) {
  return String(author || "")
    .split(",")
    .map((part) => part.trim())
    .find(Boolean) || "";
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

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}
