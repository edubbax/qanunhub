import type { PathLessonDto, PathSectionDto, PathTopicDto } from '@qanunhub/core';
import { useState } from 'react';
import { useApp } from '../app';
import { ErrorBox, Progress, Spinner, untilText, useLoad } from '../ui/components';
import { IconCheck, IconDown, IconExam, IconLock, IconPlay } from '../ui/icons';

export function PathScreen({ topicId }: { topicId?: string }) {
  const { api } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.path(), []);
  const [open, setOpen] = useState<string | null>(topicId ?? null);
  if (loading && !data) return <main className="page"><Spinner /></main>;
  if (error || !data) return <main className="page"><ErrorBox error={error} onRetry={reload} /></main>;
  const firstOpen = open ?? data.topics.find((t) => !t.locked && t.lessons.some((l) => l.state === 'available'))?.id ?? null;
  const totalLessons = data.topics.reduce((a, t) => a + t.lessons.length, 0);
  const done = data.topics.reduce((a, t) => a + t.doneLessons, 0);
  return (
    <main className="page stack">
      <section className="stack tight">
        <h1>Öyrənmə yolu · {data.category}</h1>
        <p className="muted small">Proqramın {data.topics.length} mövzusu, {totalLessons} dərs. Keçilib: {done}.</p>
        <Progress value={totalLessons ? (done / totalLessons) * 100 : 0} tone="ok" />
      </section>
      {data.topics.map((t) => (
        <TopicCard key={t.id} t={t} open={firstOpen === t.id} onToggle={() => setOpen(firstOpen === t.id ? '' : t.id)} />
      ))}
    </main>
  );
}

/** The section the learner is working on: the first one with an open lesson or an open, unpassed section test. */
function currentSection(t: PathTopicDto): string | null {
  const state = (id: string) => t.lessons.find((l) => l.id === id)?.state;
  const sec = t.sections.find((x) => x.lessonIds.some((id) => state(id) === 'available') || (x.test.available && !x.test.passed && x.test.questionCount > 0));
  return sec?.id ?? null;
}

function TopicCard({ t, open, onToggle }: { t: PathTopicDto; open: boolean; onToggle: () => void }) {
  const { nav } = useApp();
  const [shown, setShown] = useState<Set<string>>(() => new Set([currentSection(t) ?? t.sections[0]?.id ?? '']));
  const toggleSection = (id: string) => setShown((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const empty = t.lessons.length === 0;
  const pct = t.lessons.length ? (t.doneLessons / t.lessons.length) * 100 : 0;
  return (
    <section className="card topic">
      <button className="topic-head" onClick={onToggle} aria-expanded={open}>
        <span className="topic-no">{t.programNo}</span>
        <span className="grow stack tight">
          <span className="row between">
            <b>{t.shortTitle}</b>
            {t.comingSoon ? <span className="chip">Tezliklə</span> : t.locked ? <span className="chip"><IconLock />Premium</span> : t.free ? <span className="chip ok">Pulsuz</span> : null}
          </span>
          {empty ? (
            <span className="small muted">{t.note ?? 'Material hazırlanır.'}</span>
          ) : (
            <span className="row"><span className="grow"><Progress value={pct} tone={t.final.passed ? 'ok' : undefined} /></span><span className="tiny muted num">{t.doneLessons}/{t.lessons.length}</span></span>
          )}
        </span>
        <span style={{ width: 20, transform: open ? 'rotate(180deg)' : undefined }}><IconDown /></span>
      </button>
      {open && !empty && (
        <div className="lessons">
          {t.note && <p className="small muted" style={{ marginBottom: 8 }}>{t.note}</p>}
          {t.locked && (
            <div className="banner" style={{ marginBottom: 10 }}>
              <IconLock />
              <div className="grow stack tight">
                <span>Bu mövzu Premium planına daxildir.</span>
                <button className="btn primary small" style={{ alignSelf: 'flex-start' }} onClick={() => nav({ name: 'premium' })}>Planlara bax</button>
              </div>
            </div>
          )}
          {t.sections.map((sec, i) => (
            <SectionBlock key={sec.id} t={t} sec={sec} no={i + 1} single={t.sections.length === 1}
              expanded={t.sections.length === 1 || shown.has(sec.id)} onToggle={() => toggleSection(sec.id)} />
          ))}
          <button className="node final" disabled={!t.final.available || !!t.final.nextAttemptAt} onClick={() => nav({ name: 'session', kind: 'final', topicId: t.id, back: { name: 'path', topicId: t.id } })}>
            <span className="dot" style={t.final.passed ? { background: 'var(--ok)', borderColor: 'var(--ok)', color: '#fff' } : t.final.available ? { borderColor: 'var(--xp)', color: 'var(--xp)' } : undefined}><IconExam /></span>
            <span className="grow stack" style={{ gap: 0 }}>
              <b className="small">Mövzu final testi</b>
              <span className="tiny muted">
                {t.final.passed ? `Keçilib · ən yaxşı nəticə ${t.final.bestPct}%`
                  : t.final.nextAttemptAt ? `Növbəti cəhd ${untilText(t.final.nextAttemptAt)} sonra`
                  : t.final.available ? `${t.final.questionCount} sual mənbə testlərindən · keçid 80%${t.final.bestPct ? ` · ən yaxşı ${t.final.bestPct}%` : ''}`
                  : 'Bütün dərslər bitəndə açılır'}
              </span>
            </span>
          </button>
          {!t.locked && t.mastery > 0 && <p className="tiny muted" style={{ marginTop: 8 }}>Mövzu üzrə yaddaşda qalma: {t.mastery}%</p>}
        </div>
      )}
    </section>
  );
}

function SectionBlock({ t, sec, no, single, expanded, onToggle }: {
  t: PathTopicDto; sec: PathSectionDto; no: number; single: boolean; expanded: boolean; onToggle: () => void;
}) {
  const { nav } = useApp();
  const lessons = sec.lessonIds.map((id) => t.lessons.find((l) => l.id === id)).filter((l): l is PathLessonDto => !!l);
  const back = { name: 'path' as const, topicId: t.id };
  const complete = sec.doneLessons === sec.lessonIds.length && (sec.test.passed || sec.test.questionCount === 0);
  return (
    <div className="section-block">
      {!single && (
        <button className="section-head" onClick={onToggle} aria-expanded={expanded}>
          <span className={`section-no ${complete ? 'done' : ''}`}>{complete ? <IconCheck /> : no}</span>
          <span className="grow stack" style={{ gap: 0 }}>
            <b className="small">{sec.title}</b>
            <span className="tiny muted">
              {sec.doneLessons}/{sec.lessonIds.length} dərs{sec.test.questionCount > 0 ? (sec.test.passed ? ` · bölmə testi keçilib (${sec.test.bestPct}%)` : ' · bölmə testi') : ''}
            </span>
          </span>
          <span className="chev" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}><IconDown /></span>
        </button>
      )}
      {expanded && lessons.map((l) => (
        <button key={l.id} className={`node ${l.state}`} disabled={l.state === 'locked'} onClick={() => nav({ name: 'session', kind: 'lesson', lessonId: l.id, back })}>
          <span className="dot">{l.state === 'done' ? <IconCheck /> : l.state === 'available' ? <IconPlay /> : <IconLock />}</span>
          <span className="grow stack" style={{ gap: 0 }}>
            <b className="small">{l.title}</b>
            <span className="tiny muted">
              {l.refs.slice(0, 3).join(', ')}{l.refs.length > 3 ? ` … ${l.refs[l.refs.length - 1]}` : ''} · {l.estMinutes} dəq
              {l.unitCount > 0 && ` · ${l.seen}/${l.unitCount} sual`}
            </span>
          </span>
          {l.state === 'done' && l.seen < l.unitCount && <span className="chip primary">Davam</span>}
        </button>
      ))}
      {/* One-section topics go straight to the topic final. */}
      {expanded && !single && sec.test.questionCount > 0 && (
        <button className="node final section-test" disabled={!sec.test.available} onClick={() => nav({ name: 'session', kind: 'section', sectionId: sec.id, back })}>
          <span className="dot" style={sec.test.passed ? { background: 'var(--ok)', borderColor: 'var(--ok)', color: '#fff' } : sec.test.available ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : undefined}><IconExam /></span>
          <span className="grow stack" style={{ gap: 0 }}>
            <b className="small">Bölmə testi</b>
            <span className="tiny muted">
              {sec.test.passed ? `Keçilib · ən yaxşı nəticə ${sec.test.bestPct}%`
                : sec.test.available ? `${sec.test.questionCount} sual mənbə testlərindən · keçid 80%${sec.test.bestPct ? ` · ən yaxşı ${sec.test.bestPct}%` : ''}`
                : 'Bölmənin dərsləri bitəndə açılır'}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
