const TABS = [
  { id: "Brain", mark: "Br", label: "Brain" },
  { id: "Catalog", mark: "Ca", label: "Catalog" },
  { id: "Reports", mark: "Re", label: "Reports" }
];

export default function Sidebar({ active, setActive }) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand-mark" aria-label="SynThesis">
        S
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
