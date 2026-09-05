export function AppLoader() {
  return (
    <main className="app-loader" aria-live="polite" aria-label="Carregando FlowHits">
      <div className="app-loader-layers" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="app-loader-content">
        <img className="app-loader-logo" src="/LOGO%202.webp" alt="FlowHits" />
        <p>Preparando seu estúdio</p>
        <div className="app-loader-progress" aria-hidden="true"><i /></div>
      </div>
    </main>
  )
}
