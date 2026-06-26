import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { fetchMap } from "../api/index.js";

const NODE_COLORS = {
  thesis: "#9d4edd",
  topic: "#06d6a0",
  methodology: "#ef476f",
  adviser: "#118ab2",
  gap: "#ff9f1c",
  tool: "#8338ec",
  dataset: "#3a86ff"
};

const LEGEND = [
  ["Thesis", "thesis"],
  ["Topic", "topic"],
  ["Methodology", "methodology"],
  ["Adviser", "adviser"],
  ["Gap", "gap"],
  ["Tool", "tool"],
  ["Dataset", "dataset"]
];

const STOPWORDS = new Set([
  "about",
  "after",
  "against",
  "also",
  "among",
  "and",
  "are",
  "based",
  "best",
  "between",
  "can",
  "certain",
  "does",
  "for",
  "from",
  "give",
  "has",
  "have",
  "how",
  "into",
  "make",
  "paper",
  "research",
  "show",
  "study",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "thesis",
  "this",
  "topic",
  "using",
  "what",
  "when",
  "where",
  "with"
]);

const SHORT_TERMS = new Set(["ai", "ml", "nlp", "iot", "cnn", "ann", "gan", "svm", "rnn"]);

export default function BrainConstellation({ query, sources = [], activeSource, onSourceSelect, compact = false }) {
  const [payload, setPayload] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const stageRef = useRef(null);
  const size = useElementSize(stageRef);

  const sourceRefs = useMemo(() => buildSourceRefs(sources), [sources]);
  const highlightTerms = useMemo(() => extractHighlightTerms(query), [query]);
  const graphData = useMemo(
    () => normalizeMapPayload(payload, highlightTerms, sourceRefs),
    [payload, highlightTerms, sourceRefs]
  );
  const activeNodeId = resolveActiveNodeId(activeSource, sourceRefs);

  useEffect(() => {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) {
      setPayload(null);
      setSelectedNode(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedNode(null);

    fetchMap(cleanQuery)
      .then((result) => {
        if (!cancelled) setPayload(result);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setPayload(null);
          setError(
            requestError?.response?.data?.detail ||
              "The query graph could not be loaded from the map endpoint."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    if (!activeNodeId) return;
    const match = graphData.nodes.find((node) => String(node.id) === String(activeNodeId));
    if (match) setSelectedNode((current) => (current?.id === match.id ? current : match));
  }, [activeNodeId, graphData.nodes]);

  const highlightedCount = graphData.nodes.filter((node) => node.queryHighlighted || node.sourceHighlighted).length;

  return (
    <section className={`card brain-graph-card${compact ? " compact" : ""}`} aria-label="Brain query graph visualization">
      <div className="card-header">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <div>
            <p className="eyebrow">Query constellation</p>
            <h2>{compact ? "Repository map" : "Relevant nodes illuminated by the Brain query."}</h2>
            {!compact && (
              <p className="lede" style={{ marginTop: 4 }}>
                The graph uses the submitted topic to surface related theses, domains, methods, and cited source paths.
              </p>
            )}
          </div>
          <div className="toolbar graph-stats">
            <span className="badge accent">{graphData.nodes.length} nodes</span>
            <span className="badge">{graphData.links.length} links</span>
            <span className="badge info">{highlightedCount} lit</span>
          </div>
        </div>
        {highlightTerms.length > 0 && (
          <div className="meta-row query-term-row" aria-label="Highlighted query terms">
            {highlightTerms.slice(0, 8).map((term) => (
              <span key={term} className="term-chip">
                {term}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={`brain-graph-layout${compact ? " compact" : ""}`}>
        <div className="graph-stage brain-graph-stage" ref={stageRef}>
          {loading && <div className="status graph-overlay-status">Rendering the query constellation.</div>}
          {error && <div className="status error graph-overlay-status">{error}</div>}
          {!loading && !error && graphData.nodes.length === 0 && (
            <div className="status graph-overlay-status">No graph nodes were returned for this Brain query.</div>
          )}
          {!error && graphData.nodes.length > 0 && (
            <ForceGraph2D
              graphData={graphData}
              width={Math.max(size.width, 320)}
              height={Math.max(size.height, 420)}
              backgroundColor="rgba(0,0,0,0)"
              cooldownTicks={90}
              nodeId="id"
              nodeLabel={(node) => nodeTooltip(node)}
              linkLabel={(link) => link.label || link.relationship || "related"}
              nodeRelSize={5}
              linkVisibility={() => true}
              linkColor={(link) => (link.highlighted || link.cited ? "#FFBF00" : "rgba(139, 148, 158, 0.72)")}
              linkWidth={(link) => (link.highlighted || link.cited ? 2.6 : 1.15)}
              linkDirectionalParticles={(link) => (link.highlighted || link.cited ? 3 : 0)}
              linkDirectionalParticleWidth={2.4}
              linkDirectionalParticleSpeed={0.008}
              onNodeClick={(node) => {
                setSelectedNode(node);
                if (node.sourceIndex && onSourceSelect) onSourceSelect(node.sourceIndex);
              }}
              nodeCanvasObject={(node, ctx, globalScale) => drawNode(node, ctx, globalScale, selectedNode, activeNodeId)}
            />
          )}
          {String(query || "").trim() && graphData.nodes.length > 0 && (
            <div className="query-overlay-label">Query overlay: {String(query).trim()}</div>
          )}
        </div>

        {!compact && (
          <aside className="card graph-detail brain-graph-detail" aria-label="Selected query graph node details">
            {selectedNode ? <NodeDetails node={selectedNode} /> : <GraphGuide />}
          </aside>
        )}
      </div>
    </section>
  );
}

function GraphGuide() {
  return (
    <div>
      <p className="eyebrow">Detail panel</p>
      <h2>Select a lit node</h2>
      <p className="lede">
        Click a highlighted thesis, topic, method, adviser, tool, dataset, or gap node to inspect its metadata.
      </p>
      <div className="node-legend" aria-label="Graph legend">
        {LEGEND.map(([label, type]) => (
          <span key={type} className="legend-item">
            <span className="legend-dot" style={{ background: NODE_COLORS[type] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function NodeDetails({ node }) {
  const details = [
    ["Type", titleCase(node.type || "node")],
    ["Domain", node.domain || node.category || node.cluster],
    ["Proponents / authors", peopleText(node.proponents || node.authors || node.author)],
    ["Adviser / faculty", node.adviser || node.advisor || node.mentor],
    ["Year", node.year || node.publication_year],
    ["Methodology", toArray(node.methodology || node.method || node.research_design).join(", ")],
    ["Tools", toArray(node.tools || node.tool || node.frameworks || node.software || node.methodology).join(", ")],
    ["Datasets", toArray(node.datasets || node.dataset).join(", ")],
    ["Matched keywords", toArray(node.highlightTerms).join(", ")],
    ["Summary", node.summary || node.abstract || node.description],
    ["Records", node.count || node.total || node.weight]
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");

  return (
    <div>
      <p className="eyebrow">Selected node</p>
      <h2>{node.label || node.title || node.name || node.id}</h2>
      <div className="meta-row" style={{ marginTop: 12 }}>
        <span className="badge info">{titleCase(node.type || "node")}</span>
        {node.domain && <span className="badge accent">{node.domain}</span>}
        {(node.queryHighlighted || node.sourceHighlighted) && <span className="badge accent">Lit path</span>}
      </div>
      <div className="detail-list">
        {details.map(([label, value]) => (
          <div key={label} className="detail-item">
            <span className="detail-label">{label}</span>
            <span className="detail-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function drawNode(node, ctx, globalScale, selectedNode, activeNodeId) {
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

  const type = normalizeType(node.type);
  const color = NODE_COLORS[type] || NODE_COLORS.thesis;
  const radius = nodeRadius(node);
  const isSelected = selectedNode && String(selectedNode.id) === String(node.id);
  const isActiveSource = activeNodeId && String(activeNodeId) === String(node.id);
  const isLit = Boolean(node.queryHighlighted || node.sourceHighlighted || isSelected || isActiveSource);

  ctx.save();

  if (isLit) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + 14, 0, 2 * Math.PI, false);
    ctx.fillStyle = "rgba(255, 191, 0, 0.11)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + 7, 0, 2 * Math.PI, false);
    ctx.fillStyle = "rgba(255, 191, 0, 0.18)";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = color;
  ctx.shadowBlur = isLit ? 18 : 0;
  ctx.shadowColor = isLit ? "rgba(255, 191, 0, 0.75)" : "transparent";
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.lineWidth = isLit ? 2.6 : 1.25;
  ctx.strokeStyle = isLit ? "#B8860B" : "#ffffff";
  ctx.stroke();

  const label = node.label || node.title || node.name;
  const shouldLabel = isLit || type !== "thesis" || globalScale > 1.45;
  if (label && shouldLabel) {
    const fontSize = Math.max(10, 12 / globalScale);
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = isLit ? "rgba(36, 41, 47, 0.96)" : "rgba(36, 41, 47, 0.76)";
    ctx.fillText(String(label).slice(0, 38), node.x, node.y + radius + 5);
  }

  ctx.restore();
}

function nodeRadius(node) {
  const type = normalizeType(node.type);
  const value = Number(node.val || node.count || node.weight || node.size);
  const base = type === "topic" ? 9 : type === "thesis" ? 6 : 7;
  const litBoost = node.queryHighlighted || node.sourceHighlighted ? 2 : 0;
  if (!Number.isFinite(value)) return base + litBoost;
  return Math.max(base, Math.min(18, base + Math.sqrt(value))) + litBoost;
}

function normalizeMapPayload(payload, highlightTerms, sourceRefs) {
  if (!payload) return { nodes: [], links: [] };

  const graph = payload.graph || payload.map || payload;
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : Array.isArray(payload.nodes) ? payload.nodes : [];
  const rawLinks = Array.isArray(graph.links)
    ? graph.links
    : Array.isArray(graph.edges)
      ? graph.edges
      : Array.isArray(payload.links)
        ? payload.links
        : Array.isArray(payload.edges)
          ? payload.edges
          : [];

  const nodes = rawNodes.map((node, index) => normalizeNode(node, index, highlightTerms, sourceRefs));
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));

  const links = rawLinks
    .map(normalizeLink)
    .filter((link) => link.source && link.target && nodeById.has(String(link.source)) && nodeById.has(String(link.target)))
    .map((link) => {
      const source = nodeById.get(String(link.source));
      const target = nodeById.get(String(link.target));
      const highlighted = Boolean(
        link.cited ||
          link.highlighted ||
          source?.queryHighlighted ||
          target?.queryHighlighted ||
          source?.sourceHighlighted ||
          target?.sourceHighlighted
      );
      return { ...link, highlighted };
    });

  return { nodes, links };
}

function normalizeNode(node, index, highlightTerms, sourceRefs) {
  const embedded = node.data && typeof node.data === "object" ? node.data : {};
  const merged = { ...embedded, ...node };
  const id = merged.id ?? merged.node_id ?? merged.thesis_id ?? merged.key ?? merged.name ?? `${merged.type || "node"}-${index}`;
  const type = normalizeType(merged.type || merged.group || merged.kind || merged.node_type || (merged.title ? "thesis" : "topic"));
  const sourceRef = sourceRefs.byId.get(String(id));
  const searchText = nodeSearchText(merged);
  const matchingTerms = highlightTerms.filter((term) => searchText.includes(term));

  return {
    ...merged,
    id: String(id),
    type,
    label: merged.label || merged.name || merged.title || String(id),
    proponents: merged.proponents_text || merged.proponents || merged.authors || merged.author,
    val: merged.val || merged.count || merged.weight || merged.size || (type === "topic" ? 12 : 4),
    queryHighlighted: Boolean(merged.highlighted || matchingTerms.length > 0),
    sourceHighlighted: Boolean(sourceRef),
    sourceIndex: sourceRef?.index,
    highlightTerms: matchingTerms.length > 0 ? matchingTerms : toArray(merged.highlight_terms)
  };
}

function normalizeLink(link) {
  return {
    ...link,
    source: String(endpointId(link.source ?? link.source_id ?? link.sourceId ?? link.from ?? link.from_id)),
    target: String(endpointId(link.target ?? link.target_id ?? link.targetId ?? link.to ?? link.to_id)),
    label: link.label || link.relationship || link.relation || link.type || "",
    cited: Boolean(link.cited || link.highlighted || link.active || link.is_cited)
  };
}

function endpointId(value) {
  if (value && typeof value === "object") return value.id ?? value.node_id ?? value.name ?? "";
  return value ?? "";
}

function buildSourceRefs(sources) {
  const byId = new Map();
  const byIndex = new Map();

  sources.forEach((source, index) => {
    const id = source?.id ?? source?.thesis_id ?? source?.node_id;
    if (!id) return;
    const entry = { id: String(id), index: index + 1, source };
    byId.set(String(id), entry);
    byIndex.set(index + 1, entry);
  });

  return { byId, byIndex };
}

function resolveActiveNodeId(activeSource, sourceRefs) {
  if (!activeSource) return null;
  if (typeof activeSource === "number") return sourceRefs.byIndex.get(activeSource)?.id || null;
  const index = Number(activeSource);
  if (Number.isInteger(index) && sourceRefs.byIndex.has(index)) return sourceRefs.byIndex.get(index)?.id || null;
  return String(activeSource);
}

function extractHighlightTerms(query) {
  const cleanQuery = String(query || "").toLowerCase();
  const tokens = cleanQuery.match(/[a-z0-9+#.]+/g) || [];
  return [...new Set(tokens)]
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter((token) => token && !STOPWORDS.has(token))
    .filter((token) => token.length >= 3 || SHORT_TERMS.has(token))
    .slice(0, 12);
}

function nodeSearchText(node) {
  const values = [
    node.id,
    node.label,
    node.title,
    node.name,
    node.domain,
    node.category,
    node.cluster,
    node.author,
    node.authors,
    node.proponents,
    node.proponents_text,
    node.adviser,
    node.advisor,
    node.mentor,
    node.abstract,
    node.summary,
    node.description,
    node.keywords,
    node.tags,
    node.topics,
    node.methodology,
    node.method,
    node.research_design,
    node.tools,
    node.frameworks,
    node.software,
    node.datasets,
    node.dataset
  ];

  return values
    .flatMap((value) => toArray(value))
    .join(" ")
    .toLowerCase();
}

function normalizeType(type) {
  const normalized = String(type || "thesis").toLowerCase().replace(/[\s-]+/g, "_");
  if (["domain", "cluster", "category", "theme"].includes(normalized)) return "topic";
  if (["method", "methods", "research_method", "research_design"].includes(normalized)) return "methodology";
  if (["advisor", "mentor", "faculty"].includes(normalized)) return "adviser";
  if (["software", "framework", "hardware"].includes(normalized)) return "tool";
  if (["research_gap", "opportunity"].includes(normalized)) return "gap";
  if (NODE_COLORS[normalized]) return normalized;
  return "thesis";
}

function nodeTooltip(node) {
  const label = node.label || node.title || node.name || node.id;
  const type = titleCase(node.type || "node");
  const subtitle = node.domain || node.adviser || node.year || node.summary || "";
  const highlights = toArray(node.highlightTerms).join(", ");
  return `${label}<br/>${type}${subtitle ? `<br/>${subtitle}` : ""}${highlights ? `<br/>Matched: ${highlights}` : ""}`;
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 900, height: 520 });

  useEffect(() => {
    if (!ref.current) return undefined;

    const update = () => {
      const rect = ref.current.getBoundingClientRect();
      setSize({ width: rect.width || 900, height: rect.height || 520 });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function titleCase(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
