const TABS = [
  { id: "Brain", mark: "Br", label: "Brain" },
  { id: "Catalog", mark: "Ca", label: "Catalog" },
  { id: "Reports", mark: "Re", label: "Reports" }
];

export default function Sidebar({ active, setActive }) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand-mark" aria-label="SynThesis">
        <svg className="brand-glyph" viewBox="0 0 64 64" role="img" aria-hidden="true">
          <g className="brand-edges">
            <path d="M32 8 L49 18 L49 40 L32 56 L15 40 L15 18 Z" />
            <path d="M32 8 L32 30 L49 18" />
            <path d="M15 18 L32 30 L15 40" />
            <path d="M49 40 L32 30 L32 56" />
            <path d="M15 40 L49 18" />
            <path d="M15 18 L49 40" />
          </g>
          <g className="brand-nodes">
            <circle cx="32" cy="8" r="4" />
            <circle cx="49" cy="18" r="4" />
            <circle cx="49" cy="40" r="4" />
            <circle cx="32" cy="56" r="4" />
            <circle cx="15" cy="40" r="4" />
            <circle cx="15" cy="18" r="4" />
            <circle className="brand-core" cx="32" cy="30" r="6" />
          </g>
        </svg>
      </div>

      {TABS.map(({ id, mark, label }) => {
        const isActive = active === id;

        return (
          <button
            key={id}
            type="button"
            className={`nav-item${isActive ? " active" : ""}`}
            title={label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => setActive(id)}
          >
            <span className="nav-mark" aria-hidden="true">
              {mark}
            </span>
            <span className="nav-label">{label}</span>
          </button>
        );
      })}
    </aside>
  );
}
