export function App() {
  return (
    <main className="landing-shell">
      <section className="hero" aria-labelledby="quest-title">
        <p className="eyebrow">A 30-minute teacher-led learning adventure</p>
        <h1 id="quest-title">Future-Ready Campus Quest</h1>
        <p className="hero-copy">
          Join a teacher-led quest to explore, apply, and reflect with your
          assigned group.
        </p>
        <div className="hero-actions">
          <a className="primary-action" href="#/join/unavailable">
            Join your class
          </a>
          <a className="secondary-action" href="#/teacher/sign-in">
            Teacher sign in
          </a>
        </div>
        <p className="score-note">Thoughtful choices matter. Speed does not affect scoring.</p>
      </section>
      <aside className="campus-preview" aria-label="Quest route preview">
        <span className="route-dot route-dot--one" aria-hidden="true" />
        <span className="route-dot route-dot--two" aria-hidden="true" />
        <span className="route-dot route-dot--three" aria-hidden="true" />
        <ol>
          <li>Briefing Plaza</li>
          <li>Diagnostic Gate</li>
          <li>Learning Labs</li>
          <li>Challenge Hall</li>
          <li>Reflection Garden</li>
        </ol>
      </aside>
    </main>
  );
}
