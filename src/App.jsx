
const tournamentStats = [
  {
    id: 'all',
    label: 'Všetky turnaje',
    color: 'gold',
    icon: '🏆',
    count: tournaments.length,
  },
  {
    id: 'planned',
    label: 'Pripravované',
    color: 'blue',
    icon: '📅',
    count: tournaments.filter(t => t.status === 'planned').length,
  },
  {
    id: 'ongoing',
    label: 'Prebiehajúce',
    color: 'green',
    icon: '🎯',
    count: tournaments.filter(t => t.status === 'ongoing').length,
  },
  {
    id: 'completed',
    label: 'Ukončené',
    color: 'silver',
    icon: '🥇',
    count: tournaments.filter(t => t.status === 'completed').length,
  },
  {
    id: 'cancelled',
    label: 'Zrušené',
    color: 'red',
    icon: '✕',
    count: tournaments.filter(t => t.status === 'cancelled').length,
  },
];

<div className="tournament-header">
  <div className="tournament-heading">
    <div>
      <span className="section-eyebrow">ŠÍPKY PRO / SÚŤAŽE</span>
      <h1>Turnaje</h1>
      <p>Prehľad a správa všetkých klubových turnajov</p>
    </div>
    {canManageTournaments && (
      <button
        className="tournament-create-btn"
        onClick={openNewTournament}
      >
        + Nový turnaj
      </button>
    )}
  </div>

  <div className="tournament-stats">
    {tournamentStats.map(item => (
      <button
        key={item.id}
        className={`tournament-stat-card ${item.color} ${
          tournamentFilter === item.id ? 'active' : ''
        }`}
        onClick={() => setTournamentFilter(item.id)}
      >
        <span className="tournament-stat-icon">{item.icon}</span>
        <span className="tournament-stat-count">{item.count}</span>
        <span className="tournament-stat-label">{item.label}</span>
      </button>
    ))}
  </div>
</div>
