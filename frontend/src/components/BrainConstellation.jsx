import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { fetchMap } from "../api/index.js";

const NEUTRAL_NODE = "rgba(132, 145, 160, 0.62)";
const NEUTRAL_CLUSTER = "rgba(107, 122, 140, 0.8)";
const RELATED_NODE = "#e69532";

export default function BrainConstellation({ query = "", sources = [], activeSource, onSourceSelect, compact = false, graph }) {
  const [payload, setPayload] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const stageRef = useRef(null);
  const graphRef = useRef(null);
  const fittedViewportRef = useRef("");
  const size = useElementSize(stageRef);

  const sourceRefs = useMemo(() => buildSourceRefs(sources), [sources]);
  const graphData = useMemo(() => normalizeMapPayload(graph ?? payload, sourceRefs), [graph, payload, sourceRefs]);
  const activeNodeId = resolveActiveNodeId(activeSource, sourceRefs);
  const connectedCount = graphData.nodes.filter((node) => node.type === "thesis" && node.related).length;
  const viewport = useMemo(() => calculateViewport(graphData.nodes, size), [graphData.nodes, size]);

  useEffect(() => {
    if (graph) {
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMap(String(query || "").trim())
      .then((result) => {
        if (!cancelled) setPayload(result);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError?.response?.data?.detail || "The repository network could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [graph, query]);

  useEffect(() => {
    if (graphData.nodes.length === 0 || !graphRef.current) return undefined;
    const viewportKey = `${graphData.nodes.length}:${size.width}:${size.height}`;
    if (fittedViewportRef.current === viewportKey) return undefined;
    const frame = window.requestAnimationFrame(() => {
      graphRef.current?.centerAt(viewport.centerX, viewport.centerY, 0);
      graphRef.current?.zoom(viewport.minZoom, 0);
      fittedViewportRef.current = viewportKey;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [graphData.nodes.length, size.height, size.width, viewport]);

  const openConnectedStudy = (node) => {
    if (!isConnectedStudy(node)) return;
    setSelectedNode(node);
    onSourceSelect?.(node.data || node);
  };

  return (
    <section className={`card brain-graph-card repository-network${compact ? " compact" : ""}`} aria-label="Repository knowledge network">
      <div className="card-header">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <div>
            <p className="eyebrow">Knowledge network</p>
            <h2>Repository map</h2>
            <p className="lede" style={{ marginTop: 4 }}>
              Hover or click a highlighted, connected study to inspect its repository research details.
            </p>
          </div>
          <div className="toolbar graph-stats">
            <span className="badge">{graphData.nodes.filter((node) => node.type === "thesis").length} studies</span>
            <span className="badge info">{connectedCount} connected</span>
          </div>
        </div>
      </div>

      <div className={`brain-graph-layout${compact ? " compact" : ""}`}>
        <div className="graph-stage brain-graph-stage" ref={stageRef}>
          {loading && graphData.nodes.length === 0 && <div className="status graph-overlay-status">Loading repository network.</div>}
          {error && <div className="status error graph-overlay-status">{error}</div>}
          {!loading && !error && graphData.nodes.length === 0 && (
            <div className="status graph-overlay-status">No repository studies were returned.</div>
          )}
          {!error && graphData.nodes.length > 0 && (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              width={Math.max(size.width, 320)}
              height={Math.max(size.height, 420)}
              backgroundColor="rgba(0,0,0,0)"
              cooldownTicks={0}
              warmupTicks={0}
              enableNodeDrag={false}
              enablePanInteraction={false}
              enablePointerInteraction
              minZoom={viewport.minZoom}
              maxZoom={Math.max(viewport.minZoom * 6, 1)}
              nodeId="id"
              nodeRelSize={4}
              linkVisibility={(link) => Boolean(link.related)}
              linkColor={(link) => link.relationship === "adjacent_query_rank" ? "rgba(230, 149, 50, 0.42)" : "rgba(230, 149, 50, 0.78)"}
              linkWidth={(link) => link.relationship === "adjacent_query_rank" ? 1.1 : 2.1}
              linkDirectionalParticles={() => 0}
              onNodeHover={(node) => {
                const nextNode = isConnectedStudy(node) ? node : null;
                setHoveredNode((currentNode) => (String(currentNode?.id || "") === String(nextNode?.id || "") ? currentNode : nextNode));
              }}
              onNodeClick={openConnectedStudy}
              nodeCanvasObject={(node, ctx, globalScale) => drawNode(node, ctx, globalScale, selectedNode, activeNodeId)}
              nodePointerAreaPaint={(node, color, ctx) => paintPointerArea(node, color, ctx)}
            />
          )}
          {hoveredNode && <HoverCard node={hoveredNode} />}
        </div>
      </div>
    </section>
  );
}

function HoverCard({ node }) {
  const summary = String(node.abstract || node.summary || "").trim();
  const preview = summary.length > 170 ? `${summary.slice(0, 167).trimEnd()}…` : summary;

  return (
    <div className="graph-hover-card" role="status">
      <strong>{node.label}</strong>
      <span>{[node.domain, node.year].filter(Boolean).join(" · ")}</span>
      {preview && <p>{preview}</p>}
      <small>Click to open study details{node.related ? " · related to your query" : ""}</small>
    </div>
  );
}

function drawNode(node, ctx, globalScale, selectedNode, activeNodeId) {
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

  const isCluster = node.type === "topic";
  const isSelected = selectedNode && String(selectedNode.id) === String(node.id);
  const isActive = activeNodeId && String(activeNodeId) === String(node.id);
  const isRelated = Boolean(isConnectedStudy(node) || isSelected || isActive);
  const radius = isCluster ? 12 : node.relatedRank === 1 ? 18 : isRelated ? 15 : 11;

  ctx.save();
  if (isRelated) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + 14, 0, 2 * Math.PI, false);
    ctx.fillStyle = "rgba(230, 149, 50, 0.14)";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = isRelated ? RELATED_NODE : isCluster ? NEUTRAL_CLUSTER : NEUTRAL_NODE;
  ctx.fill();
  ctx.lineWidth = (isRelated ? 1.8 : 0.8) / Math.max(globalScale, 0.8);
  ctx.strokeStyle = isRelated ? "rgba(151, 83, 8, 0.88)" : "rgba(255, 255, 255, 0.88)";
  ctx.stroke();
  ctx.restore();
}

function paintPointerArea(node, color, ctx) {
  if (!isConnectedStudy(node) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(node.x, node.y, nodeRadius(node) + 12, 0, 2 * Math.PI, false);
  ctx.fill();
}

function isConnectedStudy(node) {
  return node?.type === "thesis" && Boolean(node.related);
}

function nodeRadius(node) {
  if (node.relatedRank === 1) return 18;
  return node.related ? 15 : 11;
}

function normalizeMapPayload(payload, sourceRefs) {
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
  const nodes = layoutRepositoryNodes(rawNodes.map((node, index) => normalizeNode(node, index, sourceRefs)));
  const nodeIds = new Set(nodes.map((node) => String(node.id)));
  const links = rawLinks
    .map((link) => ({
      ...link,
      source: String(endpointId(link.source ?? link.source_id ?? link.sourceId)),
      target: String(endpointId(link.target ?? link.target_id ?? link.targetId)),
      related: Boolean(link.related || link.highlight || link.highlighted)
    }))
    .filter((link) => link.related && nodeIds.has(link.source) && nodeIds.has(link.target));

  return { nodes, links };
}

function normalizeNode(node, index, sourceRefs) {
  const embedded = node.data && typeof node.data === "object" ? node.data : {};
  const merged = { ...embedded, ...node };
  const id = merged.id ?? merged.node_id ?? merged.thesis_id ?? `${merged.type || "node"}-${index}`;
  const type = normalizeType(merged.type || (merged.title ? "thesis" : "topic"));
  const sourceRef = sourceRefs.byId.get(String(id));

  return {
    ...merged,
    id: String(id),
    type,
    label: merged.label || merged.title || merged.name || String(id),
    related: Boolean(merged.related || merged.highlighted || merged.highlight),
    cited: Boolean(sourceRef),
    sourceIndex: sourceRef?.index,
    relatedRank: Number(merged.related_rank || merged.relatedRank || 0),
    val: type === "topic" ? 8 : 3
  };
}

function layoutRepositoryNodes(nodes) {
  const domainNames = [...new Set(nodes.map((node) => node.domain || "Other"))].sort();
  const domainIndex = new Map(domainNames.map((domain, index) => [domain, index]));
  const thesesByDomain = new Map(domainNames.map((domain) => [domain, []]));
  nodes.filter((node) => node.type === "thesis").forEach((node) => thesesByDomain.get(node.domain || "Other")?.push(node));
  thesesByDomain.forEach((records) => records.sort((left, right) => String(left.id).localeCompare(String(right.id))));

  return nodes.map((node) => {
    const domain = node.domain || "Other";
    const index = domainIndex.get(domain) || 0;
    const domainAngle = (Math.PI * 2 * index) / Math.max(domainNames.length, 1) - Math.PI / 2;
    const centerRadius = domainNames.length > 1 ? 285 : 0;
    const centerX = Math.cos(domainAngle) * centerRadius;
    const centerY = Math.sin(domainAngle) * centerRadius;

    if (node.type === "topic") return { ...node, fx: centerX, fy: centerY };

    const records = thesesByDomain.get(domain) || [];
    const recordIndex = records.findIndex((record) => String(record.id) === String(node.id));
    const recordAngle = (Math.PI * 2 * Math.max(recordIndex, 0)) / Math.max(records.length, 1) + domainAngle;
    const ringRadius = 72 + (Math.max(recordIndex, 0) % 3) * 16;
    return {
      ...node,
      fx: centerX + Math.cos(recordAngle) * ringRadius,
      fy: centerY + Math.sin(recordAngle) * ringRadius
    };
  });
}

function calculateViewport(nodes, size) {
  const points = nodes.filter((node) => Number.isFinite(node.fx) && Number.isFinite(node.fy));
  if (points.length === 0) return { centerX: 0, centerY: 0, minZoom: 1 };

  const xs = points.map((node) => node.fx);
  const ys = points.map((node) => node.fy);
  const padding = 48;
  const minX = Math.min(...xs) - padding;
  const maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding;
  const maxY = Math.max(...ys) + padding;
  const availableWidth = Math.max(1, size.width);
  const availableHeight = Math.max(1, size.height);

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    minZoom: Math.min(availableWidth / Math.max(maxX - minX, 1), availableHeight / Math.max(maxY - minY, 1))
  };
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

function normalizeType(type) {
  const normalized = String(type || "thesis").toLowerCase().replace(/[\s-]+/g, "_");
  return ["domain", "cluster", "category", "theme"].includes(normalized) ? "topic" : "thesis";
}

function endpointId(value) {
  if (value && typeof value === "object") return value.id ?? value.node_id ?? value.name ?? "";
  return value ?? "";
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 900, height: 520 });

  useEffect(() => {
    if (!ref.current) return undefined;
    const update = () => {
      if (!ref.current) return;
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
