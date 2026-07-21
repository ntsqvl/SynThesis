import { useEffect, useMemo, useState } from "react";
import { fetchCatalog } from "../api/index.js";

const CATALOG_PAGE_SIZE = 5;

export default function Catalog({ brainContext = {} }) {
  const [viewMode, setViewMode] = useState("related");
  const [relatedQuery, setRelatedQuery] = useState("");
  const [relatedDomain, setRelatedDomain] = useState("");
  const [repositoryQuery, setRepositoryQuery] = useState("");
  const [repositoryDomain, setRepositoryDomain] = useState("");
  const [repositoryYear, setRepositoryYear] = useState(undefined);
  const [repositoryPayload, setRepositoryPayload] = useState(null);
  const [repositoryLoading, setRepositoryLoading] = useState(false);
  const [repositoryError, setRepositoryError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStudy, setSelectedStudy] = useState(null);

  const brainQuery = String(brainContext?.query || "").trim();
  const hasBrainSearch = Boolean(brainQuery);
  const relatedCatalog = useMemo(() => normalizeCatalogPayload({ theses: brainContext?.sources || [] }), [brainContext?.sources]);
  const repositoryCatalog = useMemo(() => normalizeCatalogPayload(repositoryPayload), [repositoryPayload]);
  const isRepositoryView = viewMode === "all";

  const filteredRelatedItems = useMemo(() => {
    const search = relatedQuery.trim().toLowerCase();

    return relatedCatalog.items.filter((item) => {
      const matchesDomain = !relatedDomain || item.domain === relatedDomain;
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
        item.datasets?.join(" "),
        item.keywords?.join(" ")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !search || haystack.includes(search);
      return matchesDomain && matchesSearch;
    });
  }, [relatedCatalog.items, relatedQuery, relatedDomain]);

  useEffect(() => {
    if (!isRepositoryView) return undefined;

    let isCurrent = true;
    const timer = window.setTimeout(async () => {
      setRepositoryLoading(true);
      setRepositoryError(null);

      try {
        const payload = await fetchCatalog({
          q: repositoryQuery.trim(),
          domain: repositoryDomain,
          year: repositoryYear
        });
        if (isCurrent) setRepositoryPayload(payload);
      } catch (requestError) {
        if (isCurrent) {
          setRepositoryPayload(null);
          setRepositoryError(
            requestError?.response?.data?.detail ||
              "Could not load the repository catalog. Start FastAPI on port 8000, then try again."
          );
        }
      } finally {
        if (isCurrent) setRepositoryLoading(false);
      }
    }, 300);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [isRepositoryView, repositoryQuery, repositoryDomain, repositoryYear]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedStudy(null);
  }, [isRepositoryView, relatedQuery, relatedDomain, repositoryQuery, repositoryDomain, repositoryYear]);

  const resetRelatedFilters = () => {
    setRelatedQuery("");
    setRelatedDomain("");
    setCurrentPage(1);
  };

  const resetRepositoryFilters = () => {
    setRepositoryQuery("");
    setRepositoryDomain("");
    setRepositoryYear(undefined);
    setCurrentPage(1);
  };

  const activeItems = isRepositoryView ? repositoryCatalog.items : filteredRelatedItems;
  const totalPages = Math.max(1, Math.ceil(activeItems.length / CATALOG_PAGE_SIZE));
  const visibleItems = activeItems.slice((currentPage - 1) * CATALOG_PAGE_SIZE, currentPage * CATALOG_PAGE_SIZE);

  const switchView = (nextMode) => {
    setViewMode(nextMode);
    setCurrentPage(1);
    setSelectedStudy(null);
  };

  const headerBadge = isRepositoryView
    ? repositoryLoading
      ? "Loading studies"
      : `${repositoryCatalog.items.length} of ${repositoryCatalog.total} studies`
    : `${filteredRelatedItems.length} related records`;

  return (
    <div className="page wide">
      <header className="page-header">
        <div className="header-copy">
          <p className="eyebrow">Research catalog</p>
          <h1>{isRepositoryView ? "All repository studies." : "Studies related to the latest Brain search."}</h1>
          <p className="lede">
            {isRepositoryView
              ? "Browse and filter every thesis and faculty research record in the SynThesis repository."
              : "The catalog now narrows to repository records cited or retrieved by SynThesis in the Brain tab."}
          </p>
          {!isRepositoryView && brainQuery && (
            <p className="lede catalog-context-line">
              Showing records related to: <strong>{brainQuery}</strong>
            </p>
          )}
        </div>
        <div className="toolbar">
          <span className="badge accent">{headerBadge}</span>
          <button
            type="button"
            className="button secondary"
            onClick={() => switchView(isRepositoryView ? "related" : "all")}
          >
            {isRepositoryView ? "← Back to Brain-related" : "Browse full repository"}
          </button>
        </div>
      </header>

      {!isRepositoryView && !hasBrainSearch ? (
        <section className="card empty-state-card">
          <div className="card-body">
            <p className="eyebrow">No Brain search yet</p>
            <h2>Ask SynThesis first to populate this catalog.</h2>
            <p className="lede">
              Once a Brain query returns cited theses or faculty research, only those related records will appear here.
            </p>
          </div>
        </section>
      ) : !isRepositoryView ? (
        <>
          <section className="card">
            <div className="card-body">
              <div className="catalog-controls">
                <input
                  className="input"
                  value={relatedQuery}
                  onChange={(event) => setRelatedQuery(event.target.value)}
                  placeholder="Filter within Brain-related records by title, method, adviser, or keyword"
                  aria-label="Search related catalog records"
                />
                <select
                  className="select"
                  value={relatedDomain}
                  onChange={(event) => setRelatedDomain(event.target.value)}
                  aria-label="Filter by domain"
                >
                  <option value="">All domains</option>
                  {relatedCatalog.domains.map((domainName) => (
                    <option key={domainName} value={domainName}>
                      {domainName}
                    </option>
                  ))}
                </select>
                <button type="button" className="button secondary" onClick={resetRelatedFilters}>
                  Reset
                </button>
              </div>
            </div>
          </section>

          <div style={{ height: 18 }} />

          {selectedStudy ? (
            <CatalogDetail item={selectedStudy} onBack={() => setSelectedStudy(null)} />
          ) : (
            <CatalogResults
              title="Brain-related study index"
              description="These are the theses and faculty research records returned for the latest Brain conversation."
              badge={`${relatedCatalog.items.length} related records`}
              items={visibleItems}
              totalItems={activeItems.length}
              currentPage={currentPage}
              totalPages={totalPages}
              emptyMessage="No related records match the current filters."
              onPageChange={setCurrentPage}
              onSelect={setSelectedStudy}
            />
          )}
        </>
      ) : (
        <>
          <section className="card">
            <div className="card-body">
              <div className="catalog-controls repository-controls">
                <input
                  className="input"
                  value={repositoryQuery}
                  onChange={(event) => setRepositoryQuery(event.target.value)}
                  placeholder="Search the full repository by title, method, adviser, or keyword"
                  aria-label="Search the full repository"
                />
                <select
                  className="select"
                  value={repositoryDomain}
                  onChange={(event) => setRepositoryDomain(event.target.value)}
                  aria-label="Filter repository by domain"
                >
                  <option value="">All domains</option>
                  {repositoryCatalog.domains.map((domainName) => (
                    <option key={domainName} value={domainName}>
                      {domainName}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={repositoryYear === undefined ? "" : String(repositoryYear)}
                  onChange={(event) => setRepositoryYear(event.target.value ? Number(event.target.value) : undefined)}
                  aria-label="Filter repository by year"
                >
                  <option value="">All years</option>
                  {repositoryCatalog.years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <button type="button" className="button secondary" onClick={resetRepositoryFilters}>
                  Reset
                </button>
              </div>
            </div>
          </section>

          <div style={{ height: 18 }} />

          {repositoryLoading && <div className="status">Loading repository studies…</div>}
          {repositoryError && <div className="status error">{repositoryError}</div>}

          {!repositoryLoading && !repositoryError && (
            selectedStudy ? (
              <CatalogDetail item={selectedStudy} onBack={() => setSelectedStudy(null)} />
            ) : (
              <CatalogResults
                title="Full repository study index"
                description="Every matching thesis and faculty research record in the SynThesis repository."
                badge={`${repositoryCatalog.items.length} of ${repositoryCatalog.total} studies`}
                items={visibleItems}
                totalItems={activeItems.length}
                currentPage={currentPage}
                totalPages={totalPages}
                emptyMessage="No repository studies match the current filters."
                onPageChange={setCurrentPage}
                onSelect={setSelectedStudy}
              />
            )
          )}
        </>
      )}
    </div>
  );
}

function CatalogResults({ title, description, badge, items, totalItems, currentPage, totalPages, emptyMessage, onPageChange, onSelect }) {
  return (
    <>
      <section className="card">
        <div className="card-header">
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <div>
              <h2>{title}</h2>
              <p className="lede" style={{ marginTop: 4 }}>{description}</p>
            </div>
            <span className="badge">{badge}</span>
          </div>
        </div>
        <CatalogTable items={items} emptyMessage={emptyMessage} onSelect={onSelect} />
      </section>
      <CatalogPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={onPageChange}
      />
    </>
  );
}

function CatalogTable({ items, emptyMessage, onSelect }) {
  return (
    <div className="table-wrap catalog-table-wrap">
      <table className="table catalog-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Proponents / authors</th>
            <th>Domain</th>
            <th>Methodology</th>
            <th>Adviser / faculty</th>
            <th style={{ textAlign: "right" }}>Year</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id || `${item.title}-${item.year}`}>
              <td>
                <div style={{ display: "grid", gap: 6 }}>
                  <button
                    type="button"
                    className="catalog-title-button"
                    onClick={() => onSelect(item)}
                    aria-label={`View details for ${item.title || "Untitled thesis"}`}
                  >
                    <strong>{item.title || "Untitled thesis"}</strong>
                  </button>
                  {(item.type || item.keywords.length > 0) && (
                    <div className="meta-row">
                      {item.type && <span className="badge">{formatRecordType(item.recordKind || item.type)}</span>}
                      {item.keywords.slice(0, 4).map((keyword) => (
                        <span key={keyword} className="badge">
                          {capitalizeFirstLetter(keyword)}
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
              <td style={{ color: "var(--text-secondary)" }}>{item.methodology || "-"}</td>
              <td style={{ color: "var(--text-secondary)" }}>{item.adviser || "-"}</td>
              <td style={{ textAlign: "right", color: "var(--text-secondary)" }}>{item.year || "-"}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)" }}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CatalogPagination({ currentPage, totalPages, totalItems, onPageChange }) {
  if (totalItems === 0) return null;

  const firstItem = (currentPage - 1) * CATALOG_PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * CATALOG_PAGE_SIZE, totalItems);

  return (
    <div className="toolbar catalog-pagination">
      <span className="lede">Showing {firstItem}-{lastItem} of {totalItems} studies</span>
      {totalPages > 1 && (
        <div className="toolbar">
          <button type="button" className="button secondary" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              type="button"
              className={`button ${page === currentPage ? "" : "secondary"}`}
              aria-current={page === currentPage ? "page" : undefined}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ))}
          <button type="button" className="button secondary" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function CatalogDetail({ item, onBack }) {
  const methodology = toArray(item.methodology);

  return (
    <section className="card study-detail-card">
      <div className="study-detail-header">
        <button type="button" className="button secondary" onClick={onBack} aria-label="Back to catalog">
          ← Back to catalog
        </button>
        <span className="badge">Study details</span>
      </div>
      <div className="study-detail-body">
        <div>
          <p className="eyebrow">Repository record</p>
          <h2>{item.title || "Untitled thesis"}</h2>
          {(item.type || item.domain || item.year) && (
            <div className="meta-row" style={{ marginTop: 12 }}>
              {item.type && <span className="badge info">{formatRecordType(item.recordKind || item.type)}</span>}
              {item.domain && <span className="badge accent">{item.domain}</span>}
              {item.year && <span className="badge">{item.year}</span>}
            </div>
          )}
        </div>
        <div className="detail-list study-detail-list">
          <CatalogDetailItem label="Proponents / authors" value={item.proponentsText} />
          <CatalogDetailItem label="Adviser / faculty" value={item.adviser} />
          <CatalogDetailChips label="Methodology" values={methodology} accent />
          <CatalogDetailChips label="Tools" values={item.tools} />
          <CatalogDetailChips label="Datasets" values={item.datasets} />
          <CatalogDetailChips label="Keywords" values={item.keywords} />
          <CatalogDetailItem label="Abstract / summary" value={item.abstract || item.summary} />
        </div>
      </div>
    </section>
  );
}

function CatalogDetailItem({ label, value }) {
  if (value === undefined || value === null || String(value).trim() === "") return null;

  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{String(value)}</span>
    </div>
  );
}

function CatalogDetailChips({ label, values, accent = false }) {
  const items = unique(toArray(values));
  if (items.length === 0) return null;

  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <div className="meta-row">
        {items.map((value) => (
          <span key={value} className={`badge${accent ? " accent" : ""}`}>
            {capitalizeFirstLetter(value)}
          </span>
        ))}
      </div>
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
  const payloadYears = Array.isArray(payload?.years) ? payload.years : [];
  const derivedYears = [...new Set(items.map((item) => item.year).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

  return {
    items,
    total: Number.isFinite(Number(payload?.total)) ? Number(payload.total) : items.length,
    domains: payloadDomains.length > 0 ? payloadDomains : derivedDomains,
    years: payloadYears.length > 0 ? payloadYears : derivedYears
  };
}

function normalizeCatalogItem(item, index) {
  const methodologyList = toArray(item.methodology || item.method || item.research_design);
  const tools = unique([...toArray(item.tools || item.tool || item.frameworks || item.software), ...methodologyList]);
  const keywords = toArray(item.keywords || item.tags || item.topics);
  const datasets = toArray(item.datasets || item.dataset || item.data_set || item.data_sources);
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
    keywords,
    datasets
  };
}

function formatRecordType(type) {
  return String(type || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function capitalizeFirstLetter(value) {
  const text = String(value || "");
  return text.replace(/^(\s*)([a-z])/, (_, spacing, firstLetter) => `${spacing}${firstLetter.toUpperCase()}`);
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
