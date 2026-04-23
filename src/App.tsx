import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

const WEEKLY_HOURS = 21
const WEEKLY_MINUTES = WEEKLY_HOURS * 60
const MAX_HOURS_PER_LOG = 23
const MAX_MINUTES_PER_LOG = 59
const tableName = import.meta.env.VITE_TABLE_NAME || 'talktime_logs'

type TalktimeLog = {
  id: string
  day: string
  hours: number
  talked_about: string | null
  created_at: string
}

type ConfirmModalState =
  | { type: 'delete'; logId: string }
  | { type: 'reset' }
  | null

const formatDuration = (minutes: number) => {
  const absMinutes = Math.abs(minutes)
  const hours = Math.floor(absMinutes / 60)
  const mins = absMinutes % 60
  const prefix = minutes < 0 ? '-' : ''
  return `${prefix}${hours}h ${mins}m`
}

const getWeekWindow = () => {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())

  const end = new Date(start)
  end.setDate(start.getDate() + 7)

  return { start, end }
}

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function App() {
  const [logs, setLogs] = useState<TalktimeLog[]>([])
  const [hoursInput, setHoursInput] = useState(0)
  const [minutesInput, setMinutesInput] = useState(30)
  const [talkedAbout, setTalkedAbout] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null)
  const [error, setError] = useState('')

  const { start, end } = useMemo(() => getWeekWindow(), [])

  const usedMinutes = logs.reduce((total, log) => total + Math.round(log.hours * 60), 0)
  const remainingMinutes = WEEKLY_MINUTES - usedMinutes
  const progressPercent = Math.max(0, Math.min(100, Math.round((remainingMinutes / WEEKLY_MINUTES) * 100)))
  const remainingHours = Math.max(0, Math.floor(remainingMinutes / 60))
  const remainingMins = Math.max(0, remainingMinutes % 60)
  const resetDateLabel = end.toLocaleString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

  const loadLogs = async () => {
    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from(tableName)
      .select('id, day, hours, talked_about, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(`Could not load logs: ${fetchError.message}`)
      setLoading(false)
      return
    }

    setLogs(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    // Initial hydration from Supabase happens once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSpend = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    const safeHours = clampNumber(hoursInput, 0, MAX_HOURS_PER_LOG)
    const safeMinutes = clampNumber(minutesInput, 0, MAX_MINUTES_PER_LOG)
    const spentMinutes = safeHours * 60 + safeMinutes
    if (spentMinutes <= 0) {
      setError('Please add at least 1 minute of talk time.')
      setSaving(false)
      return
    }

    const now = new Date()
    const hoursValue = Number((spentMinutes / 60).toFixed(2))
    const dayLabel = `${now.toLocaleDateString('en-US', { weekday: 'long' })} · ${now.toLocaleDateString()}`

    const { error: insertError } = await supabase.from(tableName).insert({
      day: dayLabel,
      hours: hoursValue,
      talked_about: talkedAbout.trim() || null,
    })

    if (insertError) {
      setError(`Could not save this talk session: ${insertError.message}`)
      setSaving(false)
      return
    }

    setHoursInput(0)
    setMinutesInput(30)
    setTalkedAbout('')
    await loadLogs()
    setSaving(false)
  }

  const runDelete = async (id: string) => {
    setDeletingId(id)
    setError('')

    const deletedAt = new Date().toISOString()
    const { data: deletedRows, error: deleteError } = await supabase
      .from(tableName)
      .update({ deleted_at: deletedAt })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')

    if (deleteError) {
      setError(`Could not delete this log: ${deleteError.message}`)
      setDeletingId(null)
      return
    }
    if (!deletedRows || deletedRows.length === 0) {
      setError('Could not delete this log: it may already be archived or blocked by permissions.')
      setDeletingId(null)
      return
    }

    setLogs((currentLogs) => currentLogs.filter((log) => log.id !== id))
    await loadLogs()
    setDeletingId(null)
  }

  const runResetWeek = async () => {
    setResetting(true)
    setError('')

    const deletedAt = new Date().toISOString()
    const { data: resetRows, error: resetError } = await supabase
      .from(tableName)
      .update({ deleted_at: deletedAt })
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .is('deleted_at', null)
      .select('id')

    if (resetError) {
      setError(`Could not reset this week: ${resetError.message}`)
      setResetting(false)
      return
    }
    if (!resetRows) {
      setError('Could not reset this week: no rows were updated.')
      setResetting(false)
      return
    }

    setLogs([])
    await loadLogs()
    setResetting(false)
  }

  const handleDelete = (id: string) => {
    setConfirmModal({ type: 'delete', logId: id })
  }

  const handleResetWeek = () => {
    setConfirmModal({ type: 'reset' })
  }

  const handleConfirmAction = async () => {
    if (!confirmModal) {
      return
    }

    if (confirmModal.type === 'delete') {
      const id = confirmModal.logId
      setConfirmModal(null)
      await runDelete(id)
      return
    }

    setConfirmModal(null)
    await runResetWeek()
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="hero-eyebrow">✦ OUR LITTLE UNIVERSE ✦</p>
        <h1>Talk Time Ipsh</h1>
        <span className="week-pill">
          Week of {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
          {new Date(end.getTime() - 1).toLocaleDateString('en-US', { day: 'numeric' })}
        </span>
      </header>

      <section className="card wallet-card">
        <div className="wallet-ring" style={{ ['--progress' as string]: `${progressPercent}%` }}>
          <div>
            <strong>{progressPercent}%</strong>
            <span>remaining</span>
          </div>
        </div>
        <div className="wallet-info">
          <p className="wallet-label">Balance</p>
          <p className={`wallet-balance ${remainingMinutes <= 0 ? 'expired' : ''}`}>{formatDuration(remainingMinutes)}</p>
          <p className="wallet-subtitle">
            {remainingHours} hrs {remainingMins} min left
          </p>
        </div>
        <div className="mini-stats">
          <div className="mini-box">
            <span>Spent</span>
            <strong>{formatDuration(usedMinutes).replace('h ', 'h ')}</strong>
          </div>
          <div className="mini-box">
            <span>Resets</span>
            <strong>{resetDateLabel}</strong>
          </div>
        </div>
      </section>

      {remainingMinutes <= 0 && !loading && (
        <section className="card alert-card">
          <p>🥺 Aww, your talktime wallet is exhausted.</p>
          <p>Have you talked more than needed... or just loved more than expected?</p>
        </section>
      )}

      <section className="card log-card">
        <h2>Log a call ♡</h2>
        <form onSubmit={handleSpend} className="spend-form">
          <div className="time-grid">
            <label>
              <span>Hours</span>
              <input
                type="number"
                min={0}
                max={MAX_HOURS_PER_LOG}
                value={hoursInput}
                inputMode="numeric"
                onChange={(event) =>
                  setHoursInput(clampNumber(Number(event.target.value), 0, MAX_HOURS_PER_LOG))
                }
                onBlur={(event) =>
                  setHoursInput(clampNumber(Number(event.target.value), 0, MAX_HOURS_PER_LOG))
                }
                required
              />
            </label>
            <div className="colon">:</div>
            <label>
              <span>Minutes</span>
              <input
                type="number"
                min={0}
                max={MAX_MINUTES_PER_LOG}
                value={minutesInput}
                inputMode="numeric"
                onChange={(event) =>
                  setMinutesInput(clampNumber(Number(event.target.value), 0, MAX_MINUTES_PER_LOG))
                }
                onBlur={(event) =>
                  setMinutesInput(clampNumber(Number(event.target.value), 0, MAX_MINUTES_PER_LOG))
                }
                required
              />
            </label>
          </div>
          <textarea
            placeholder="What did you two talk about? 🌙"
            value={talkedAbout}
            onChange={(event) => setTalkedAbout(event.target.value)}
            rows={3}
          />
          <button type="submit" disabled={saving}>
            {saving ? 'Recording...' : '✦ Record this call ✦'}
          </button>
        </form>
      </section>

      <section className="card history-card">
        <h2>This week&apos;s calls</h2>
        {loading && <p className="empty-state">Loading your logs...</p>}
        {!loading && logs.length === 0 && <p className="empty-state">Nothing logged yet — start talking!</p>}

        {!loading && logs.length > 0 && (
          <ul>
            {logs.map((log) => (
              <li key={log.id}>
                <div className="log-main">
                  <p>{log.day}</p>
                  <span>
                    {new Date(log.created_at).toLocaleTimeString()} · {formatDuration(Math.round(log.hours * 60))}
                  </span>
                  {log.talked_about ? <em>{log.talked_about}</em> : null}
                </div>
                <div className="log-actions">
                  <button
                    type="button"
                    className="delete-btn"
                    disabled={deletingId === log.id}
                    onClick={() => handleDelete(log.id)}
                  >
                    {deletingId === log.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className="reset-btn" onClick={handleResetWeek} disabled={resetting || loading}>
        {resetting ? 'Resetting...' : '↻ RESET WEEK'}
      </button>

      {error && (
        <section className="card error-card">
          <p>{error}</p>
        </section>
      )}

      {confirmModal && (
        <section className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h3 id="confirm-title">{confirmModal.type === 'delete' ? 'Delete this log?' : 'Reset this week?'}</h3>
            <p>
              {confirmModal.type === 'delete'
                ? 'This talk entry will be moved to archive.'
                : 'This will archive all logs from the current week.'}
            </p>
            <div className="modal-actions">
              <button type="button" className="modal-btn ghost" onClick={() => setConfirmModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn danger"
                onClick={handleConfirmAction}
                disabled={deletingId !== null || resetting}
              >
                {confirmModal.type === 'delete' ? 'Yes, delete' : 'Yes, reset'}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
