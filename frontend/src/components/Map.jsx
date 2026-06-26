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

export default function ResearchMap() {
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const stageRef = useRef(null);
  const size = useElementSize(stageRef);

  const graphData = useMemo(() => normalizeMapPayload(payload), [payload]);

  const loadMap = async (submittedQuery = query) => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);

    try {
      const result = await fetchMap(submittedQuery.trim());
      setPayload(result);
    } catch (requestError) {
      setPayload(null);
      setError(
        requestError?.response?.data?.detail ||
          "Backend unreachable. Start FastAPI on port 8000, then reload the map."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMap("");
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    loadMap(query);
  };

  const resetQuery = () => {
    setQuery("");
    loadMap("");
  };

  return (
    <div className="page wide">
      <header className="page-header">
        <div className="header-copy">
          <p className="eyebrow">Constellation map</p>
          <h1>Explore thesis connections as a research graph.</h1>
          <p className="lede">
            Filter by topic, inspect clusters, and click individual thesis nodes to reveal the supporting metadata.
          </p>
        </div>
        <div className="toolbar">
          <span className="badge accent">{graphData.nodes.length} nodes</span>
          <span className="badge">{graphData.links.length} edges</span>
        </div>
      </header>

      <section className="card">
        <div className="card-body">
          <form onSubmit={handleSubmit} className="catalog-controls">
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter the constellation by topic, method, adviser, or tool"
              aria-label="Filter research map"
            />
            <button className="button" type="submit" disabled={loading}>
              {loading ? "Loading" : "Apply filter"}
            </button>
            <button className="button secondary" type="button" onClick={resetQuery} disabled={loading && !query}>
              Reset
            </button>
          </form>
        </div>
      </section>

      <div style={{ height: 18 }} />

      {error && <div className="status error">{error}</div>}
      {loading && <div className="status">Rendering the research constellation from JSON graph data.</div>}

      {!loading && !error && (
        <section className="graph-layout">
          <div className="card graph-stage" ref={stageRef} aria-label="Research graph visualization">
            {graphData.nodes.length === 0 ? (
              <div className="status" style={{ margin: 24 }}>
                No graph nodes were returned for this query.
              </div>
            ) : (
              <ForceGraph2D
                graphData={graphData}
                width={Math.max(size.width, 320)}
                height={Math.max(size.height, 420)}
                backgroundColor="rgba(0,0,0,0)"
                cooldownTicks={80}
                nodeId="id"
                nodeLabel={(node) => nodeTooltip(node)}
                nodeRelSize={5}
                linkDirectionalParticles={(link) => (link.cited || link.highlighted ? 2 : 0)}
                linkDirectionalParticleWidth={2}
                linkDirectionalParticleSpeed={0.006}
                linkColor={(link) => (link.cited || link.highlighted ? "#FFBF00" : "#e1e4e8")}
                linkWidth={(link) => (link.cited || link.highlighted ? 2.2 : 1)}
                onNodeClick={(node) => setSelectedNode(node)}
                nodeCanvasObject={(node, ctx, globalScale) => drawNode(node, ctx, globalScale, selectedNode)}
              />
            )}
            {query.trim() && graphData.nodes.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: 18,
                  bottom: 18,
                  maxWidth: 420,
                  padding: "10px 12px",
                  border: "1px solid rgba(255, 191, 0, 0.35)",
                  borderRadius: 14,
                  background: "rgba(255, 248, 220, 0.92)",
                  color: "var(--accent-primary-muted)",
                  fontSize: 13,
                  fontWeight: 700
                }}
              >
                Query overlay: {query.trim()}
              </div>
            )}
          </div>

          <aside className="card graph-detail" aria-label="Selected graph node details">
            {selectedNode ? <NodeDetails node={selectedNode} /> : <MapGuide />}
          </aside>
        </section>
      )}
    </div>
  );
}

function MapGuide() {
  return (
    <div>
      <p className="eyebrow">Detail panel</p>
      <h2>Select a node</h2>
      <p className="lede">
        Click a domain cluster, adviser, methodology, tool, dataset, gap, or thesis node to inspect its JSON metadata.
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
    ["Adviser / faculty", node.adviser || node.advisor || node.mentor],
    ["Author", node.author || node.authors],
    ["Year", node.year || node.publication_year],
    ["Methodology", toArray(node.methodology || node.method || node.research_design).join(", ")],
    ["Tools", toArray(node.tools || node.tool || node.frameworks || node.software || node.methodology).join(", ")],
    ["Datasets", toArray(node.datasets || node.dataset).join(", ")],
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

function drawNode(node, ctx, globalScale, selectedNode) {
  const type = normalizeType(node.type);
  const color = NODE_COLORS[type] || NODE_COLORS.thesis;
  const radius = nodeRadius(node);
  const isSelected = selectedNode && String(selectedNode.id) === String(node.id);

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + 8, 0, 2 * Math.PI, false);
    ctx.fillStyle = "rgba(255, 191, 0, 0.18)";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = isSelected ? 2.5 : 1.2;
  ctx.strokeStyle = isSelected ? "#B8860B" : "#ffffff";
  ctx.stroke();

  const label = node.label || node.title || node.name;
  const shouldLabel = isSelected || type !== "thesis" || globalScale > 1.6;
  if (!label || !shouldLabel) return;

  const fontSize = Math.max(10, 12 / globalScale);
  ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(36, 41, 47, 0.86)";
  ctx.fillText(String(label).slice(0, 34), node.x, node.y + radius + 4);
}

function nodeRadius(node) {
  const type = normalizeType(node.type);
  const value = Number(node.val || node.count || node.weight || node.size);
  const base = type === "topic" ? 9 : type === "thesis" ? 6 : 7;
  if (!Number.isFinite(value)) return base;
  return Math.max(base, Math.min(18, base + Math.sqrt(value)));
}

function normalizeMapPayload(payload) {
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

  const nodes = rawNodes.map(normalizeNode);
  const nodeIds = new Set(nodes.map((node) => String(node.id)));
  const links = rawLinks
    .map(normalizeLink)
    .filter((link) => link.source && link.target && nodeIds.has(String(link.source)) && nodeIds.has(String(link.target)));

  return { nodes, links };
}

function normalizeNode(node, index) {
  const embedded = node.data && typeof node.data === "object" ? node.data : {};
  const merged = { ...embedded, ...node };
  const id = merged.id ?? merged.node_id ?? merged.thesis_id ?? merged.key ?? merged.name ?? `${merged.type || "node"}-${index}`;
  const type = normalizeType(merged.type || merged.group || merged.kind || merged.node_type || (merged.title ? "thesis" : "topic"));

  return {
    ...merged,
    id: String(id),
    type,
    label: merged.label || merged.name || merged.title || String(id),
    val: merged.val || merged.count || merged.weight || merged.size || (type === "topic" ? 12 : 4)
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
  return `${label}<br/>${type}${subtitle ? `<br/>${subtitle}` : ""}`;
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 900, height: 560 });

  useEffect(() => {
    if (!ref.current) return undefined;

    const update = () => {
      const rect = ref.current.getBoundingClientRect();
      setSize({ width: rect.width || 900, height: rect.height || 560 });
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
