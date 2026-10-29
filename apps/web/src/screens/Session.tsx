// Lesson / review / section test / final / mock player: cards → questions with feedback (or exam mode) → result.
import type { AnswerDto, CardDto, CompleteDto, HeartsDto, QuestionDto, ReviewEntryDto, SessionDto } from '@qanunhub/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Route } from '../app';
import { useApp } from '../app';
import { ApiError } from '../api/types';
import { Modal, Progress, Spinner, toast, untilText } from '../ui/components';
import { AWARDS, ROMAN } from '@qanunhub/core';
import { IconAlert, IconBolt, IconCheck, IconClock, IconFlag, IconFlame, IconShield, IconStar, IconX } from '../ui/icons';
import { Epaulette, LifeStars, Medal } from '../ui/insignia';

type SessionRoute = Extract<Route, { name: 'session' }>;
const LETTERS = 'ABCDEFGH';

export function SessionScreen({ route }: { route: SessionRoute }) {
  const { api, nav, refreshMe } = useApp();
  const back: Route = route.back ?? { name: 'home' };
  const [session, setSession] = useState<SessionDto | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [phase, setPhase] = useState<'cards' | 'quiz' | 'result'>('cards');
  const [cardIdx, setCardIdx] = useState(0);
  const [queue, setQueue] = useState<QuestionDto[]>([]);
  const [pos, setPos] = useState(0);
  const [hearts, setHearts] = useState<HeartsDto | null>(null);
  const [result, setResult] = useState<CompleteDto | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [heartsOut, setHeartsOut] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const deadline = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    api.startSession(route.kind, { lessonId: route.lessonId, topicId: route.topicId, sectionId: route.sectionId, competitionId: route.competitionId }).then(
      (s) => {
        if (!alive) return;
        setSession(s);
        setQueue(s.questions);
        setHearts(s.hearts);
        setPhase(s.cards.length ? 'cards' : 'quiz');
        if (s.timeLimitSec) deadline.current = Date.now() + s.timeLimitSec * 1000;
      },
      (e) => alive && setError(e instanceof ApiError ? e : new ApiError('ERR', String(e), 0)),
    );
    return () => { alive = false; };
  }, [api, route]);

  const finish = useCallback(async () => {
    if (!session || finishing) return;
    setFinishing(true);
    try {
      const r = await api.complete(session.id);
      setResult(r);
      setPhase('result');
      refreshMe();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Nəticə saxlanmadı.');
    } finally {
      setFinishing(false);
    }
  }, [api, session, finishing, refreshMe]);

  if (error) return <SessionError error={error} back={back} />;
  if (!session) return <Spinner />;

  const answeredCount = pos;
  const total = queue.length;
  const progress = phase === 'cards' ? 0 : phase === 'result' ? 100 : (answeredCount / Math.max(1, total)) * 100;

  return (
    <>
      {phase !== 'result' && (
        <div className="session-top">
          <button className="icon-btn" aria-label="Çıx" onClick={() => setConfirmExit(true)}><IconX /></button>
          <div className="grow"><Progress value={progress} /></div>
          {session.timeLimitSec && <Timer deadline={deadline.current!} onExpire={finish} />}
          {hearts && <span className="stat hearts"><LifeStars current={hearts.current} max={hearts.max} size={24} /></span>}
        </div>
      )}

      {phase === 'cards' && (
        <Cards
          title={session.title}
          subtitle={session.subtitle}
          cards={session.cards}
          idx={cardIdx}
          setIdx={setCardIdx}
          onDone={() => setPhase('quiz')}
        />
      )}

      {phase === 'quiz' && queue[pos] && (
        <QuestionView
          key={`${queue[pos].qid}`}
          session={session}
          q={queue[pos]}
          index={pos}
          total={total}
          onAnswered={(res) => {
            if (res.hearts) setHearts(res.hearts);
            if (res.appended) setQueue((qq) => [...qq, res.appended!]);
            if (res.heartsOut) setHeartsOut(true);
          }}
          onNext={() => {
            if (pos + 1 >= queue.length) finish();
            else setPos(pos + 1);
          }}
          isLast={pos + 1 >= queue.length}
        />
      )}
      {phase === 'quiz' && !queue[pos] && <div className="session-body"><Spinner /></div>}

      {phase === 'result' && result && <Result r={result} back={back} />}

      {heartsOut && phase === 'quiz' && (
        <Modal>
          <div className="row"><LifeStars current={0} size={30} /><h2>Paqonda ulduz qalmadı</h2></div>
          <p>Yeni dərslər 4 saat sonra açılacaq. Təkrar ulduz xərcləmir: 10 sualdan 8-ni düz cavablasan, 1 ulduz qaytarırsan.</p>
          <button className="btn primary block" onClick={() => { setHeartsOut(false); finish(); }}>Dərsi bitir</button>
          <button className="btn secondary block" onClick={() => nav({ name: 'premium' })}>Premium: ulduzlar tükənmir</button>
        </Modal>
      )}

      {confirmExit && (
        <Modal onClose={() => setConfirmExit(false)}>
          <h2>Çıxmaq istəyirsən?</h2>
          <p className="muted">{session.examMode ? 'Verdiyin cavablar nəticəyə sayılacaq, qalan suallar səhv hesablanacaq.' : 'Cavab verdiyin suallar təkrar cədvəlinə düşüb. Dərs bitmiş sayılmayacaq və XP verilməyəcək.'}</p>
          {session.examMode ? (
            <button className="btn danger block" onClick={() => { setConfirmExit(false); finish(); }}>Testi bitir</button>
          ) : (
            <button className="btn danger block" onClick={() => nav(back)}>Çıx</button>
          )}
          <button className="btn secondary block" onClick={() => setConfirmExit(false)}>Davam et</button>
        </Modal>
      )}
    </>
  );
}

function Timer({ deadline, onExpire }: { deadline: number; onExpire: () => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, deadline - now);
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      onExpire();
    }
  }, [left, onExpire]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return <span className={`timer row ${left < 120000 ? 'low' : ''}`} style={{ gap: 4 }}><span style={{ width: 18, display: 'inline-flex' }}><IconClock /></span>{m}:{String(s).padStart(2, '0')}</span>;
}

function SessionError({ error, back }: { error: ApiError; back: Route }) {
  const { nav } = useApp();
  const lockedUntil = typeof error.data?.lockedUntil === 'number' ? (error.data.lockedUntil as number) : null;
  const next = typeof error.data?.nextAttemptAt === 'number' ? (error.data.nextAttemptAt as number) : null;
  return (
    <main className="page no-tabs stack loose" style={{ paddingTop: 48 }}>
        <div className="row" style={{ color: 'var(--xp)' }}>
          {error.code === 'HEARTS_LOCKED' ? <LifeStars current={0} size={30} /> : <IconAlert />}
          <h1>{error.code === 'HEARTS_LOCKED' ? 'Ulduzların bitib' : error.code === 'PREMIUM_REQUIRED' ? 'Premium tələb olunur' : 'Başlamaq olmadı'}</h1>
        </div>
        <p>{error.message}</p>
        {lockedUntil && <p className="muted">Ulduzlar {untilText(lockedUntil)} sonra bərpa olunacaq.</p>}
        {next && <p className="muted">Növbəti cəhd {untilText(next)} sonra mümkündür.</p>}
        {error.code === 'HEARTS_LOCKED' && <button className="btn primary block" onClick={() => nav({ name: 'session', kind: 'review', back })}>Təkrar et və ulduz qaytar</button>}
        {(error.code === 'PREMIUM_REQUIRED' || error.code === 'HEARTS_LOCKED') && <button className="btn secondary block" onClick={() => nav({ name: 'premium' })}>Premium planlara bax</button>}
        <button className="btn ghost" onClick={() => nav(back)}>Geri qayıt</button>
    </main>
  );
}

function Cards({ title, subtitle, cards, idx, setIdx, onDone }: { title: string; subtitle: string; cards: CardDto[]; idx: number; setIdx: (n: number) => void; onDone: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const c = cards[idx];
  useEffect(() => setRevealed(false), [idx]);
  const next = () => (idx + 1 < cards.length ? setIdx(idx + 1) : onDone());
  return (
    <>
      <main className="session-body stack">
        <div className="stack tight">
          <span className="tiny muted">{subtitle} · izah {idx + 1}/{cards.length}</span>
          <h2>{title}</h2>
        </div>
        <article className={`law-card ${c.kind}`}>
          {c.kind === 'qa' ? (
            <>
              <div className="head">{c.title}</div>
              {revealed ? <div className="body" style={{ fontFamily: 'var(--f-ui)' }}>{c.body}</div> : (
                <button className="btn secondary block" onClick={() => setRevealed(true)}>Cavabı göstər</button>
              )}
            </>
          ) : (
            <>
              {c.title && <div className="head">{c.title}</div>}
              <div className="body">{c.body}</div>
            </>
          )}
        </article>
        {c.kind === 'qa' && <p className="tiny muted">Əvvəlcə cavabı özün xatırlamağa çalış, sonra yoxla.</p>}
        {c.kind === 'law' && <p className="tiny muted">Mənbə: qanunun mətni. Rəsmi redaksiya e-qanun.az-dadır.</p>}
      </main>
      <div className="sheet">
        <div className="sheet-inner">
          <div className="row">
            {idx > 0 && <button className="btn secondary" onClick={() => setIdx(idx - 1)}>Geri</button>}
            <button className="btn primary grow" onClick={next}>{idx + 1 < cards.length ? 'Növbəti' : 'Suallara keç'}</button>
          </div>
          {idx + 1 < cards.length && <button className="btn ghost small" onClick={onDone}>İzahı keç, suallara başla</button>}
        </div>
      </div>
    </>
  );
}

function QuestionView({ session, q, index, total, onAnswered, onNext, isLast }: {
  session: SessionDto; q: QuestionDto; index: number; total: number; isLast: boolean;
  onAnswered: (r: AnswerDto) => void; onNext: () => void;
}) {
  const { api } = useApp();
  const [sel, setSel] = useState<number[]>([]);
  const [res, setRes] = useState<AnswerDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(false);
  const shownAt = useRef(Date.now());
  const multi = q.type === 'multi';

  const toggle = (i: number) => {
    if (res) return;
    setSel((s) => (multi ? (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]) : [i]));
  };

  const submit = async () => {
    if (!sel.length || busy || res) return;
    setBusy(true);
    try {
      const r = await api.answer(session.id, q.qid, sel, Date.now() - shownAt.current);
      onAnswered(r);
      if (session.examMode) onNext();
      else setRes(r);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Cavab göndərilmədi.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (report) return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) toggle(n - 1);
      if (e.key === 'Enter') {
        if (res) onNext();
        else submit();
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  const state = (i: number) => {
    if (!res || res.correctIndexes == null) return sel.includes(i) ? 'on' : '';
    if (res.correctIndexes.includes(i)) return 'right';
    if (sel.includes(i)) return 'wrong';
    return '';
  };

  return (
    <>
      <main className="session-body stack">
        <div className="row between">
          <span className="tiny muted">{q.requeue ? 'Təkrar · ' : ''}{q.topicTitle} · {index + 1}/{total}</span>
          {q.points > 1 && <span className="chip xp">{q.points} bal</span>}
        </div>
        <p className="stem">{q.stem}</p>
        {q.statements && q.statements.length > 0 && (
          <ol className="statements">{q.statements.map((s, i) => <li key={i}><b>{i + 1}.</b><span>{s}</span></li>)}</ol>
        )}
        {multi && <p className="small muted">Bütün doğru variantları seç (açıq tapşırıq).</p>}
        <div className="options" role={multi ? 'group' : 'radiogroup'}>
          {q.options.map((o, i) => (
            <button key={i} className={`option ${multi ? 'multi' : ''} ${state(i)}`} onClick={() => toggle(i)} disabled={!!res} role={multi ? 'checkbox' : 'radio'} aria-checked={sel.includes(i)}>
              <span className="key">{multi ? (sel.includes(i) || state(i) === 'right' ? <IconCheck /> : i + 1) : LETTERS[i]}</span>
              <span>{o}</span>
            </button>
          ))}
        </div>
        {!session.examMode && !res && (
          <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setReport(true)}><IconFlag />Sualda səhv var</button>
        )}
      </main>

      {!res && (
        <div className="sheet">
          <div className="sheet-inner">
            <button className="btn primary block" disabled={!sel.length || busy} onClick={submit}>
              {session.examMode ? (isLast ? 'Cavabla və bitir' : 'Cavabla, növbəti') : 'Yoxla'}
            </button>
          </div>
        </div>
      )}
      {res && (
        <div className={`sheet ${res.correct ? 'right' : 'wrong'}`}>
          <div className="sheet-inner">
            <div className="verdict">{res.correct ? <><IconCheck />Düzdür!</> : <><IconX />Səhvdir</>}</div>
            {(res.explanation || res.ref || res.source) && (
              <div className="expl stack tight">
                {res.explanation && <p>{res.explanation}</p>}
                <p className="tiny muted">{[res.ref, res.source].filter(Boolean).join(' · ')}</p>
              </div>
            )}
            {!res.correct && <p className="small">Bu sual dərsin sonunda yenidən gələcək, sonra 1 və 3 gün sonra təkrarlanacaq.</p>}
            <div className="row">
              <button className="btn secondary" onClick={() => setReport(true)} aria-label="Səhv bildir"><IconFlag /></button>
              <button className={`btn ${res.correct ? 'ok' : 'danger'} grow`} onClick={onNext}>{isLast ? 'Bitir' : 'Davam et'}</button>
            </div>
          </div>
        </div>
      )}
      {report && <ReportModal sessionId={session.id} qid={q.qid} onClose={() => setReport(false)} />}
    </>
  );
}

function ReportModal({ sessionId, qid, onClose }: { sessionId: string; qid: number; onClose: () => void }) {
  const { api } = useApp();
  const [reason, setReason] = useState('wrong_answer');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const reasons: [string, string][] = [
    ['wrong_answer', 'Düzgün cavab səhv göstərilib'],
    ['outdated', 'Qanun dəyişib, məlumat köhnədir'],
    ['typo', 'Yazı və ya hərf səhvi'],
    ['unclear', 'Sual aydın deyil'],
    ['other', 'Başqa'],
  ];
  return (
    <Modal onClose={onClose}>
      <h2>Sualda səhv bildir</h2>
      <p className="small muted">Hüquqşünaslarımız 48 saat ərzində baxır. Təsdiqlənən hər bildirişə görə +20 XP.</p>
      <div className="stack tight">
        {reasons.map(([k, label]) => (
          <label key={k} className="check"><input type="radio" name="reason" checked={reason === k} onChange={() => setReason(k)} />{label}</label>
        ))}
      </div>
      <div className="field">
        <label htmlFor="report-body">Qeyd (istəyə bağlı)</label>
        <textarea id="report-body" className="input" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Məsələn: qanunun 7.2-ci maddəsinə görə düzgün cavab C-dir." />
      </div>
      <button className="btn primary block" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          await api.report(sessionId, qid, reason, body);
          toast('Təşəkkürlər! Bildiriş redaktorlara göndərildi.');
          onClose();
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Göndərilmədi.');
        } finally {
          setBusy(false);
        }
      }}>Göndər</button>
      <button className="btn secondary block" onClick={onClose}>Ləğv et</button>
    </Modal>
  );
}

const LB_NOTES: Partial<Record<CompleteDto['leaderboard'], string>> = {
  unverified: 'XP reytinqə sayılmadı: email ünvanın hələ təsdiqlənməyib.',
  too_fast: 'XP reytinqə sayılmadı: cavablar oxumaq üçün lazım olan vaxtdan xeyli tez verildi. Ümumi XP-yə əlavə olundu.',
  daily_cap: 'Bu günün reytinq limiti (600 XP) dolub. Qalan XP ümumi hesabına yazıldı.',
  banned: 'Hesabın reytinqdə iştirakdan kənarlaşdırılıb.',
};

function Result({ r, back }: { r: CompleteDto; back: Route }) {
  const { nav } = useApp();
  const exam = r.kind === 'final' || r.kind === 'mock' || r.kind === 'section' || r.kind === 'competition';
  const mistakes = r.review.filter((x) => !x.correct);
  const title = !r.completed ? 'Dərs dayandı' : r.kind === 'competition' ? 'Yarış cəhdin qeydə alındı' : exam ? (r.passed ? 'Keçdin!' : 'Hələ keçid balı yoxdur') : r.kind === 'lesson' ? 'Dərs bitdi!' : 'Təkrar bitdi!';
  return (
    <main className="page no-tabs stack loose">
      <section className="result-hero">
        <span style={{ width: 56, height: 56, color: !r.completed ? 'var(--bad)' : r.passed === false ? 'var(--xp)' : 'var(--ok)' }}>
          {!r.completed ? <IconAlert /> : r.passed === false ? <IconAlert /> : <IconStar />}
        </span>
        <h1>{title}</h1>
        {exam ? (
          <>
            <span className="big">{r.pct}%</span>
            <p className="muted">{r.points} / {r.maxPoints} bal{r.targetPercent != null ? ` · hədəf ${r.targetPercent}%${r.kind === 'mock' ? ' (alt qrupunun keçid faizi)' : ''}` : ''}</p>
          </>
        ) : (
          <p className="muted">{r.correct} / {r.total} sual ilk cəhddə düz</p>
        )}
      </section>

      <section className="kpi">
        <div className="card"><b className="row" style={{ gap: 4, color: 'var(--primary)' }}><span style={{ width: 20, display: 'inline-flex' }}><IconBolt /></span>{r.xp}</b><span>XP{r.leaderboardCounted ? ' · reytinqə' : ''}</span></div>
        <div className="card"><b className="row" style={{ gap: 4, color: 'var(--gold)' }}><span style={{ width: 20, display: 'inline-flex' }}><IconShield /></span>{r.rank.meritDelta > 0 ? '+' : ''}{r.rank.meritDelta}</b><span>xidmət balı</span></div>
        <div className="card"><b className="row" style={{ gap: 4, color: 'var(--xp)' }}><span style={{ width: 20, display: 'inline-flex' }}><IconFlame /></span>{r.streak}</b><span>{r.streakIncreased ? 'seriya artdı' : 'ardıcıl gün'}</span></div>
      </section>

      {r.rank.change === 'up' && (
        <div className="gain">
          <Epaulette code={r.rank.code} size={56} />
          <div className="grow stack tight"><b>Təbrik! Yeni rütbə</b><span className="rank-title">{r.rank.title}</span></div>
        </div>
      )}
      {r.rank.change === 'down' && <div className="banner bad"><IconAlert />Rütbən endi: {r.rank.title}. Hər gün məşq edərək geri qaytar.</div>}
      {r.awards.map((a) => {
        const def = AWARD_LOOK[a.id] ?? { shape: 'medal' as const, color: 'gold' };
        return (
          <div key={a.id} className="gain">
            <Medal shape={def.shape} color={def.color} tier={a.tier} earned title={a.title} size={56} />
            <div className="grow stack tight"><b>Yeni təltif</b><span>{a.title} · {ROMAN[a.tier - 1]} dərəcə</span></div>
          </div>
        );
      })}
      {r.heartEarned && <div className="banner"><IconStar />Paqonuna 1 ulduz qayıtdı.</div>}
      {!r.completed && <div className="banner bad"><IconAlert />Ulduzlar bitdiyi üçün dərs bitmiş sayılmadı. Cavabların təkrar cədvəlinə düşüb.</div>}
      {LB_NOTES[r.leaderboard] && <div className="banner warn"><IconAlert />{LB_NOTES[r.leaderboard]}</div>}
      {r.kind === 'mock' && <p className="small muted">Sınaq yalnız qanunvericilik bölməsini (40 tapşırıq) ölçür. Real imtahanda keçid balı dörd fənnin cəmi üzrə hesablanır.</p>}

      {r.review.length > 0 && (exam || mistakes.length > 0) && (
        <section className="stack">
          <h2>{exam ? 'Cavabların təhlili' : 'Səhv etdiyin suallar'}</h2>
          {(exam ? r.review : mistakes).map((x) => <ReviewItem key={x.qid} x={x} />)}
        </section>
      )}

      <div className="stack">
        {!r.completed && <button className="btn primary block" onClick={() => nav({ name: 'session', kind: 'review', back })}>Təkrar et və ulduz qaytar</button>}
        <button className={`btn ${r.completed ? 'primary' : 'secondary'} block`} onClick={() => nav(back)}>Davam et</button>
        {r.kind === 'lesson' && back.name !== 'path' && <button className="btn ghost" onClick={() => nav({ name: 'path' })}>Öyrənmə yoluna bax</button>}
      </div>
    </main>
  );
}

const AWARD_LOOK: Record<string, { shape: 'medal' | 'order' | 'badge'; color: string }> = Object.fromEntries(
  AWARDS.map((a) => [a.id, { shape: a.shape, color: a.color }]),
);

function ReviewItem({ x }: { x: ReviewEntryDto }) {
  return (
    <article className={`review-item ${x.correct ? 'right' : 'wrong'} stack tight`}>
      <span className="tiny muted">{x.topicTitle}</span>
      <p className="small" style={{ fontWeight: 600 }}>{x.stem}</p>
      {x.statements && <ol className="statements small">{x.statements.map((s, i) => <li key={i}><b>{i + 1}.</b><span>{s}</span></li>)}</ol>}
      <div className="stack tight small">
        {x.options.map((o, i) => {
          const right = x.correctIndexes.includes(i);
          const given = x.given.includes(i);
          if (!right && !given) return null;
          return (
            <span key={i} style={{ color: right ? 'var(--ok)' : 'var(--bad)' }}>
              {right ? '✓' : '✗'} {LETTERS[i]}) {o}{given && !right ? ' (sənin cavabın)' : ''}
            </span>
          );
        })}
        {x.given.length === 0 && <span className="muted">Cavab verilməyib</span>}
      </div>
      {x.explanation && <p className="tiny muted">{x.explanation}{x.ref ? ` · ${x.ref}` : ''}</p>}
    </article>
  );
}
