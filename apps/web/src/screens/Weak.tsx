import { useApp } from '../app';
import { ErrorBox, Progress, Spinner, useLoad } from '../ui/components';
import { IconAlert, IconChevron } from '../ui/icons';

export function Weak() {
  const { api, nav } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.weak(), []);
  return (
    <main className="page stack">
      <section className="stack tight">
        <h1>Zəif mövzular</h1>
        <p className="muted small">Sıralama: unudulmağa yaxın suallar, səhv faizi və 4 dəfədən çox səhv etdiyin «inadkar» suallar. Hər gücləndirmə 10 sualdır.</p>
      </section>
      {loading && !data && <Spinner />}
      {error ? <ErrorBox error={error} onRetry={reload} /> : null}
      {data && data.length === 0 && <div className="card flat empty">Hələ kifayət qədər məlumat yoxdur. Bir neçə dərs keçəndən sonra burada zəif mövzuların görünəcək.</div>}
      {data?.map((w, i) => (
        <button key={w.topicId} className="tile" onClick={() => nav({ name: 'session', kind: 'weak', topicId: w.topicId, back: { name: 'weak' } })}>
          <span className={`ico ${i < 3 ? 'bad' : ''}`}>{i < 3 ? <IconAlert /> : <b>{i + 1}</b>}</span>
          <span className="grow stack tight">
            <b>{w.title}</b>
            <Progress value={w.mastery} tone={w.mastery >= 80 ? 'ok' : undefined} />
            <span className="tiny muted">
              Yaddaşda {w.mastery}% · səhv {Math.round(w.errorRate * 100)}% · {w.seen} sual görülüb{w.leeches ? ` · ${w.leeches} inadkar sual` : ''}
            </span>
          </span>
          <IconChevron />
        </button>
      ))}
    </main>
  );
}
