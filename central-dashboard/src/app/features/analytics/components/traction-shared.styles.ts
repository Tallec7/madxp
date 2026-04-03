/** Shared styles for traction section components */
export const TRACTION_SHARED_STYLES = `
  /* Sections */
  .section {
    margin-bottom: 2.5rem;
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 1rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #e2e8f0;
  }

  /* KPI Grid */
  .kpi-grid {
    display: grid;
    gap: 1rem;
  }

  .kpi-grid-4 {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }

  .kpi-grid-3 {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }

  /* KPI Cards */
  .kpi-card {
    padding: 1.5rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    border-left: 4px solid #e2e8f0;
  }

  .kpi-card.accent-blue { border-left-color: #3b82f6; }
  .kpi-card.accent-green { border-left-color: #10b981; }
  .kpi-card.accent-purple { border-left-color: #8b5cf6; }
  .kpi-card.accent-orange { border-left-color: #f59e0b; }
  .kpi-card.accent-teal { border-left-color: #14b8a6; }
  .kpi-card.accent-pink { border-left-color: #ec4899; }
  .kpi-card.accent-indigo { border-left-color: #6366f1; }
  .kpi-card.accent-red { border-left-color: #ef4444; }

  .kpi-value {
    font-size: 2rem;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
  }

  .kpi-label {
    font-size: 0.875rem;
    color: #64748b;
    margin-top: 0.25rem;
  }

  .kpi-sub {
    font-size: 0.75rem;
    color: #94a3b8;
    margin-top: 0.25rem;
  }

  /* Small KPI cards */
  .kpi-card-small {
    padding: 1rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    text-align: center;
  }

  .kpi-card-small.warning {
    border: 1px solid #f59e0b;
    background: #fffbeb;
  }

  .kpi-card-small.danger {
    border: 1px solid #ef4444;
    background: #fef2f2;
  }

  .kpi-value-sm {
    font-size: 1.5rem;
    font-weight: 700;
    color: #0f172a;
  }

  /* Card */
  .card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .card h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: #475569;
  }

  .mt-1 { margin-top: 1rem; }

  /* Table */
  .data-table {
    width: 100%;
    border-collapse: collapse;
  }

  .data-table th,
  .data-table td {
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid #f1f5f9;
  }

  .data-table th {
    font-weight: 600;
    color: #64748b;
    font-size: 0.75rem;
    text-transform: uppercase;
    background: #f8fafc;
    position: sticky;
    top: 0;
  }

  .data-table td {
    color: #0f172a;
    font-size: 0.875rem;
  }

  .data-table tbody tr:hover {
    background: #f8fafc;
  }

  .text-right { text-align: right; }
  .font-bold { font-weight: 700; }
  .font-mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8125rem; }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .badge-green {
    background: #ecfdf5;
    color: #065f46;
  }

  .badge-orange {
    background: #fffbeb;
    color: #92400e;
  }

  .badge-red {
    background: #fef2f2;
    color: #991b1b;
  }

  /* Sport bars */
  .sport-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sport-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .sport-info {
    display: flex;
    justify-content: space-between;
  }

  .sport-name {
    font-weight: 600;
    color: #0f172a;
    font-size: 0.875rem;
    text-transform: capitalize;
  }

  .sport-count {
    font-size: 0.75rem;
    color: #64748b;
  }

  .sport-bar-container {
    height: 8px;
    background: #f1f5f9;
    border-radius: 4px;
    overflow: hidden;
  }

  .sport-bar {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #60a5fa);
    border-radius: 4px;
    min-width: 4px;
  }

  @media (max-width: 768px) {
    .kpi-grid-4 {
      grid-template-columns: repeat(2, 1fr);
    }

    .kpi-grid-3 {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;
