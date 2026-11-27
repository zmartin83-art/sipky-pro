import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, UserPlus, Copy, RefreshCw, Shield,
  UserRound, ClipboardCheck, Trash2
} from 'lucide-react';

const ROLE_LABELS = {
  admin: 'Administrátor',
  organizer: 'Organizátor',
  scorer: 'Zapisovateľ',
  viewer: 'Divák',
};

const ROLE_OPTIONS = [
  { value: 'organizer', label: 'Organizátor' },
  { value: 'scorer', label: 'Zapisovateľ' },
  { value: 'viewer', label: 'Divák' },
];

export default function Members({ supabase, club, role, userId }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteLink, setInviteLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isAdmin = role === 'admin';

  const loadMembers = useCallback(async () => {
    if (!club?.id) return;

    setLoading(true);
    setError('');

    const { data, error: loadError } = await supabase
      .from('club_members')
      .select('user_id, role')
      .eq('club_id', club.id)
      .order('role');

    if (loadError) {
      setError('Členov sa nepodarilo načítať: ' + loadError.message);
    } else {
      setMembers(data || []);
    }

    setLoading(false);
  }, [supabase, club?.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function createInvitation(event) {
    event.preventDefault();

    if (!isAdmin || !club?.id || busy) return;

    setBusy(true);
    setError('');
    setMessage('');
    setInviteLink('');

    const { data, error: inviteError } = await supabase.rpc(
      'create_club_invitation',
      {
        p_club_id: club.id,
        p_email: email.trim() || null,
        p_role: inviteRole,
      }
    );

    if (inviteError) {
      setError('Pozvánku sa nepodarilo vytvoriť: ' + inviteError.message);
      setBusy(false);
      return;
    }

    const token = Array.isArray(data) ? data[0] : data;

    if (!token) {
      setError('Databáza nevrátila token pozvánky.');
      setBusy(false);
      return;
    }

    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('invite', token);

    setInviteLink(url.toString());
    setMessage('Pozvánka bola vytvorená.');
    setEmail('');
    setBusy(false);
  }

  async function copyInvitation() {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
      setMessage('Pozvánkový odkaz bol skopírovaný.');
    } catch {
      setError('Odkaz označ a skopíruj ručne.');
    }
  }

  async function changeRole(member, newRole) {
    if (!isAdmin || member.role === 'admin') return;

    setError('');
    setMessage('');

    const { error: updateError } = await supabase.rpc(
      'sp_update_club_member_role',
      {
        p_club_id: club.id,
        p_user_id: member.user_id,
        p_role: newRole,
      }
    );

    if (updateError) {
      setError('Rolu sa nepodarilo zmeniť: ' + updateError.message);
      return;
    }

    setMessage('Rola člena bola zmenená.');
    await loadMembers();
  }

  async function removeMember(member) {
    if (!isAdmin || member.user_id === userId) return;

    const confirmed = window.confirm(
      'Naozaj chceš odstrániť tohto člena z klubu?'
    );

    if (!confirmed) return;

    setError('');
    setMessage('');

    const { error: removeError } = await supabase.rpc(
      'sp_remove_club_member',
      {
        p_club_id: club.id,
        p_user_id: member.user_id,
      }
    );

    if (removeError) {
      setError('Člena sa nepodarilo odstrániť: ' + removeError.message);
      return;
    }

    setMessage('Člen bol odstránený z klubu.');
    await loadMembers();
  }

  return (
    <div className="sp-members">
      <div className="sp-page-title">
        <div>
          <span className="sp-kicker">KLUBOVÁ ADMINISTRÁCIA</span>
          <h1>Členovia klubu</h1>
          <p>Správa členstva a prístupových oprávnení klubu {club.name}.</p>
        </div>

        <button
          className="sp-outline"
          onClick={loadMembers}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Obnoviť
        </button>
      </div>

      {message && <div className="sp-member-success">{message}</div>}
      {error && <div className="sp-member-error">{error}</div>}

      <div className="sp-member-stats">
        <div className="sp-panel">
          <Users size={23} />
          <span>Počet členov</span>
          <strong>{members.length}</strong>
        </div>

        <div className="sp-panel">
          <Shield size={23} />
          <span>Administrátori</span>
          <strong>
            {members.filter(member => member.role === 'admin').length}
          </strong>
        </div>

        <div className="sp-panel">
          <UserRound size={23} />
          <span>Ostatní členovia</span>
          <strong>
            {members.filter(member => member.role !== 'admin').length}
          </strong>
        </div>
      </div>

      {isAdmin && (
        <div className="sp-panel sp-invitation-panel">
          <h2><UserPlus size={20} /> Pozvať nového člena</h2>

          <p>
            Vytvor pozvánkový odkaz a pošli ho osobe, ktorú chceš
            pridať do klubu.
          </p>

          <form onSubmit={createInvitation}>
            <label>
              E-mail pozvaného (nepovinný)
              <input
                type="email"
                placeholder="meno@email.sk"
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </label>

            <label>
              Pridelená rola
              <select
                value={inviteRole}
                onChange={event => setInviteRole(event.target.value)}
              >
                {ROLE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="sp-primary" disabled={busy}>
              <UserPlus size={17} />
              {busy ? 'Vytváram pozvánku…' : 'Vytvoriť pozvánku'}
            </button>
          </form>

          {inviteLink && (
            <div className="sp-generated-invite">
              <label>Vytvorený pozvánkový odkaz</label>
              <input
                readOnly
                value={inviteLink}
                onFocus={event => event.target.select()}
              />

              <button className="sp-primary" onClick={copyInvitation}>
                <Copy size={17} />
                Kopírovať odkaz
              </button>
            </div>
          )}
        </div>
      )}

      <div className="sp-panel sp-members-list">
        <div className="sp-members-heading">
          <h2><Users size={20} /> Zoznam členov</h2>
          <span>{members.length} členov</span>
        </div>

        {loading ? (
          <p className="sp-empty">Načítavam členov…</p>
        ) : members.length === 0 ? (
          <p className="sp-empty">Klub zatiaľ nemá žiadnych členov.</p>
        ) : (
          members.map(member => (
            <div className="sp-member-row" key={member.user_id}>
              <div className="sp-member-avatar">
                <UserRound size={20} />
              </div>

              <div className="sp-member-details">
                <strong>
                  {member.user_id === userId
                    ? 'Tvoj účet'
                    : 'Člen klubu'}
                </strong>
                <small>{member.user_id}</small>
                <span className="sp-member-role">
                  {ROLE_LABELS[member.role] || member.role}
                </span>
              </div>

              {isAdmin && member.role !== 'admin' && (
                <div className="sp-member-actions">
                  <select
                    value={member.role}
                    onChange={event => changeRole(member, event.target.value)}
                  >
                    {ROLE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <button
                    className="sp-member-remove"
                    title="Odstrániť člena"
                    onClick={() => removeMember(member)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              )}

              {member.role === 'admin' && (
                <span className="sp-admin-label">
                  <Shield size={15} /> Administrátor
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
