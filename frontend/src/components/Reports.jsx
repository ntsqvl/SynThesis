import { useEffect, useMemo, useState } from "react";
import { fetchReports } from "../api/index.js";

const TOP_METHOD_LIMIT = 10;

export default function Reports({ brainContext = {} }) {
  const [payload, setPayload] = useState(null);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const baseReport = useMemo(() => normalizeReportsPayload(payload), [payload]);
  const brainSources = Array.isArray(brainContext?.sources) ? brainContext.sources : [];
  const brainRanking = normalizeAdviserRanking(brainContext?.adviserRanking || brainContext?.adviser_ranking || []);
  const hasBrainSearch = Boolean(String(brainContext?.query || "").trim());

  const report = useMemo(
    () => buildVisibleReport(baseReport, brainSources, brainRanking, domain),
    [baseReport, brainSources, brainRanking, domain]
  );

  const domains = useMemo(() => {
    const sourceDomains = brainSources.map((source) => source.domain).filter(Boolean).map(String);
    return [...new Set([...baseReport.domains, ...sourceDomains])].sort();
  }, [baseReport.domains, brainSources]);

  const loadReports = async (selectedDomain = "") => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchReports(selectedDomain, TOP_METHOD_LIMIT);
      setPayload(result);
    } catch (requestError) {
      setPayload(null);
      setError(
        requestError?.response?.data?.detail ||
          "Backend unreachable. Start FastAPI on port 8000, then reload the reports tab."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports("");
  }, []);

  const handleDomainChange = (event) => {
    const selectedDomain = event.target.value;
    setDomain(selectedDomain);
    loadReports(selectedDomain);
  };

  return (
    <div className="page wide">
      <div className="report-title-row">
        <header className="header-copy">
          <p className="eyebrow">Research reports</p>
          <h1>Most used methods, tools, and ranked advisers.</h1>
          <p className="lede">
            Methodology and tool counts are limited to the most used entries. Adviser recommendations are restricted to Adviser Rankings.
          </p>
          {hasBrainSearch && (
            <p className="lede catalog-context-line">
              Brain context: <strong>{brainContext.query}</strong>
            </p>
          )}
        </header>

        {domains.length > 0 && (
          <select className="select" value={domain} onChange={handleDomainChange} style={{ maxWidth: 260 }}>
            <option value="">All domains</option>
            {domains.map((domainName) => (
              <option key={domainName} value={domainName}>
                {domainName}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="status error">{error}</div>}
      {loading && <div className="status">Building methodology and adviser reports from repository data.</div>}

      {!loading && !error && (
        <div className="section-stack">
          <section className="card">
            <div className="card-header">
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <div>
                  <h2>1. Most used methodology and tools</h2>
                  <p className="lede" style={{ marginTop: 4 }}>
                    {brainSources.length > 0
                      ? "Top methods and tools counted from the Brain-related studies."
                      : "Top methods and tools counted from the repository report."}
                  </p>
                </div>
                <span className="badge accent">Top {Math.min(TOP_METHOD_LIMIT, report.methodologyBreakdown.length || TOP_METHOD_LIMIT)}</span>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Tool or methodology</th>
                    <th>Description</th>
                    <th style={{ textAlign: "right" }}>Uses</th>
                  </tr>
                </thead>
                <tbody>
                  {report.methodologyBreakdown.map((item) => (
                    <tr key={item.tool || item.methodology}>
                      <td>
                        <strong>{item.tool || item.methodology || "Unspecified"}</strong>
                      </td>
                      <td style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
                        {item.description || "Used by related repository studies as a method, model, tool, or evaluation technique."}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="badge accent">{item.count ?? item.uses ?? 0}</span>
                      </td>
                    </tr>
                  ))}
                  {report.methodologyBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)" }}>
                        No methodology data for this domain or Brain context.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <div>
                  <h2>2. Adviser recommendations from Adviser Rankings</h2>
                  <p className="lede" style={{ marginTop: 4 }}>
                    Only ranked advisers/faculty from the Brain or report Adviser Rankings are shown here.
                  </p>
                </div>
                <span className="badge">{report.adviserRecommendations.length} ranked advisers</span>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Faculty</th>
                    <th>Domains</th>
                    <th>Relevant works</th>
                    <th style={{ textAlign: "right" }}>Alignment score</th>
                  </tr>
                </thead>
                <tbody>
                  {report.adviserRecommendations.map((adviser) => (
                    <tr key={adviser.name}>
                      <td>
                        <strong>{adviser.name || "Unnamed adviser"}</strong>
                      </td>
                      <td style={{ color: "var(--text-secondary)" }}>{adviser.faculty || adviser.department || "CCSMA"}</td>
                      <td>
                        <div className="meta-row">
                          {adviser.domains.length > 0 ? (
                            adviser.domains.map((domainName) => (
                              <span key={domainName} className="badge info">
                                {domainName}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>-</span>
                          )}
                        </div>
                      </td>
                      <td style={{ color: "var(--text-secondary)", minWidth: 260 }}>
                        {adviser.relevantTheses.length > 0 ? adviser.relevantTheses.slice(0, 3).join("; ") : `${adviser.thesesMentored} relevant works`}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--text-secondary)" }}>
                        <span className="badge accent">{adviser.alignmentScore ?? 0}</span>
                      </td>
                    </tr>
                  ))}
                  {report.adviserRecommendations.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)" }}>
                        No Adviser Rankings are available for this context. Run a Brain query to generate ranked adviser recommendations.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function buildVisibleReport(baseReport, brainSources, brainRanking, domain) {
  const sourceSubset = domain
    ? brainSources.filter((source) => String(source.domain || "").toLowerCase() === domain.toLowerCase())
    : brainSources;

  const methodologyBreakdown = brainSources.length > 0
    ? buildMethodologyBreakdownFromSources(sourceSubset, baseReport.methodologyBreakdown)
    : baseReport.methodologyBreakdown.slice(0, TOP_METHOD_LIMIT);

  const rankingSource = brainRanking.length > 0 ? brainRanking : baseReport.adviserRankings;
  const recommendations = buildRankedAdviserRecommendations(rankingSource, baseReport.adviserRecommendations, sourceSubset, domain);

  return {
    methodologyBreakdown,
    adviserRecommendations: recommendations,
    domains: baseReport.domains
  };
}

function buildMethodologyBreakdownFromSources(sources, knownDescriptions) {
  const descriptions = new Map(
    knownDescriptions.map((item) => [normalizeName(item.tool || item.methodology), item.description || ""])
  );
  const counter = new Map();

  sources.forEach((source) => {
    const perStudy = new Set([
      ...toArray(source.methodology || source.method || source.research_design),
      ...toArray(source.tools || source.tool || source.frameworks || source.software)
    ].filter(Boolean));

    perStudy.forEach((tool) => {
      counter.set(tool, (counter.get(tool) || 0) + 1);
    });
  });

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_METHOD_LIMIT)
    .map(([tool, count]) => ({
      tool,
      methodology: tool,
      count,
      description: descriptions.get(normalizeName(tool)) || `${tool} appears in the Brain-related repository studies.`
    }));
}

function buildRankedAdviserRecommendations(rankingSource, reportRecommendations, sources, domain) {
  const recommendationLookup = new Map(reportRecommendations.map((item) => [normalizeName(item.name), item]));
  const domainLookup = buildAdviserDomainLookup(sources);
  const filteredRanking = normalizeAdviserRanking(rankingSource).filter((item) => item.name && (!domain || item.domains.length === 0 || item.domains.includes(domain)));

  return filteredRanking.map((rank) => {
    const reportMatch = recommendationLookup.get(normalizeName(rank.name)) || {};
    const derivedDomains = domainLookup.get(normalizeName(rank.name)) || [];
    const domains = unique([...(rank.domains || []), ...(reportMatch.domains || []), ...derivedDomains]);
    const relevantTheses = unique([...(rank.relevantTheses || []), ...(reportMatch.relevantTheses || [])]);

    return {
      name: rank.name,
      faculty: reportMatch.faculty || "CCSMA",
      domains,
      thesesMentored: rank.thesesMentored || reportMatch.thesesMentored || relevantTheses.length,
      relevantTheses,
      alignmentScore: rank.alignmentScore ?? reportMatch.alignmentScore ?? 0
    };
  });
}

function buildAdviserDomainLookup(sources) {
  const lookup = new Map();
  sources.forEach((source) => {
    const domain = source.domain;
    if (!domain) return;
    adviserNamesForSource(source).forEach((name) => {
      const key = normalizeName(name);
      lookup.set(key, unique([...(lookup.get(key) || []), domain]));
    });
  });
  return lookup;
}

function adviserNamesForSource(source) {
  if (source.type === "faculty_paper") return toArray(source.author || source.authors);
  return toArray(source.adviser || source.advisor || source.mentor || source.adviser_or_faculty);
}

function normalizeReportsPayload(payload) {
  const source = payload || {};
  const methodologyRaw =
    source.methodology_breakdown ||
    source.methodologyBreakdown ||
    source.methods ||
    source.tools ||
    source.methodology_tools ||
    [];
  const advisersRaw =
    source.adviser_recommendations ||
    source.adviserRecommendations ||
    source.advisers ||
    source.advisors ||
    [];
  const adviserRankingsRaw = source.adviser_rankings || source.adviserRanking || source.adviser_ranking || [];

  const methodologyBreakdown = Array.isArray(methodologyRaw)
    ? methodologyRaw.map((item) => ({
        tool: item.tool || item.name || item.methodology || item.method || item.label || "Unspecified",
        methodology: item.methodology || item.method || item.tool || item.name || "Unspecified",
        description: item.description || item.summary || item.generated_description || item.notes || "",
        count: item.count ?? item.uses ?? item.frequency ?? item.total ?? 0,
        domains: toArray(item.domains || item.domain)
      }))
    : [];

  const adviserRecommendations = Array.isArray(advisersRaw)
    ? advisersRaw.map((item) => ({
        name: item.name || item.adviser || item.advisor || item.faculty_name || "Unnamed adviser",
        faculty: item.faculty || item.department || item.college || item.role || "",
        domains: toArray(item.domains || item.domain || item.specializations || item.expertise),
        thesesMentored: item.theses_mentored ?? item.thesesMentored ?? item.works_count ?? item.relevant_works ?? item.count ?? item.total ?? 0,
        alignmentScore: item.alignment_score ?? item.alignmentScore ?? item.score ?? 0,
        relevantTheses: toArray(item.relevant_theses || item.relevantTheses || item.works || item.theses)
      }))
    : [];

  const adviserRankings = normalizeAdviserRanking(adviserRankingsRaw);
  const explicitDomains = Array.isArray(source.domains) ? source.domains : [];
  const derivedDomains = [
    ...methodologyBreakdown.flatMap((item) => item.domains),
    ...adviserRecommendations.flatMap((item) => item.domains),
    ...adviserRankings.flatMap((item) => item.domains)
  ];

  return {
    methodologyBreakdown: methodologyBreakdown.sort((a, b) => Number(b.count || 0) - Number(a.count || 0)),
    adviserRecommendations,
    adviserRankings,
    domains: [...new Set([...explicitDomains, ...derivedDomains].filter(Boolean).map(String))].sort()
  };
}

function normalizeAdviserRanking(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    name: item.name || item.adviser || item.advisor || item.faculty_name || "Unnamed adviser",
    adviser: item.adviser || item.name || item.advisor || item.faculty_name || "Unnamed adviser",
    alignmentScore: item.alignment_score ?? item.alignmentScore ?? item.score ?? 0,
    thesesMentored: item.theses_mentored ?? item.thesesMentored ?? item.works_count ?? item.relevant_works ?? item.count ?? item.total ?? 0,
    relevantTheses: toArray(item.relevant_theses || item.relevantTheses || item.works || item.theses),
    domains: toArray(item.domains || item.domain)
  }));
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

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}
