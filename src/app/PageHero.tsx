/** Teal title band used across the client-facing pages (matches the Work With Tim design). */
export function PageHero({ eyebrow, title, lead }: { eyebrow: string; title: React.ReactNode; lead?: React.ReactNode }) {
  return (
    <section className="page-hero">
      <div className="inner">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
    </section>
  );
}
