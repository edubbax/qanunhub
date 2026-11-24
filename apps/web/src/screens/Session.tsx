// Lesson / review / drill / section test / final / mock player.
// A lesson runs intro → learn (law cards with the numbers, deadlines and organs marked, key facts, exam heat) →
// mixed check (test questions and number drills) → recap (key facts and mistakes with the law's words).
import type { AnswerDto, CardDto, CompleteDto, HeartsDto, QuestionDto, ReviewEntryDto, SessionDto } from '@qanunhub/core';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Route } from '../app';
import { useApp } from '../app';
import { ApiError } from '../api/types';
import { comingSoon, Modal, Progress, Spinner, toast, untilText } from '../ui/components';
import { AWARDS, ROMAN } from '@qanunhub/core';
import { IconAlert, IconBolt, IconCheck, IconClock, IconFlag, IconFlame, IconInfo, IconShield, IconStar, IconX } from '../ui/icons';
import { Epaulette, LifeStars, Medal } from '../ui/insignia';

type SessionRoute = Extract<Route, { name: 'session' }>;
const LETTERS = 'ABCDEFGH';

export function SessionScreen({ route }: { route: SessionRoute }) {
  const { api, nav, refreshMe } = useApp();
  const back: Route = route.back ?? { name: 'home' };
  const [session, setSession] = useState<SessionDto | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [phase, setPhase] = useState<'intro' | 'cards' | 'quiz' | 'result'>('cards');
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
        setPhase(s.kind === 'lesson' && s.cards.length ? 'intro' : s.cards.length ? 'cards' : 'quiz');
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
  // One bar for the whole lesson: the cards take the first third when there are any, the questions the rest.
  const cardCount = session.cards.length;
  const cardShare = cardCount ? 35 : 0;
  const progress = phase === 'intro' ? 0 : phase === 'result' ? 100
    : phase === 'cards' ? (cardIdx / Math.max(1, cardCount)) * cardShare
    : cardShare + (answeredCount / Math.max(1, total)) * (100 - cardShare);

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

      {phase === 'intro' && <LessonIntro session={session} onStart={() => setPhase('cards')} onSkip={() => setPhase('quiz')} />}

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

      {phase === 'result' && result && <Result r={result} back={back} cards={session.kind === 'lesson' ? session.cards : []} />}

      {heartsOut && phase === 'quiz' && (
        <Modal>
          <div className="row"><LifeStars current={0} size={30} /><h2>Paqonda ulduz qalmadı</h2></div>
          <p>Yeni dərslər 4 saat sonra açılacaq. Təkrar ulduz xərcləmir: 10 sualdan 8-ni düzgün cavablandırsan, paqonuna 1 ulduz qayıdır.</p>
          <button className="btn primary block" onClick={() => { setHeartsOut(false); finish(); }}>Dərsi bitir</button>
          <button className="btn secondary block" onClick={() => comingSoon('Tükənməyən ulduzlar')}>Premium: ulduzlar tükənmir — tezliklə</button>
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
          <h1>{error.code === 'HEARTS_LOCKED' ? 'Ulduzların bitib' : error.code === 'PREMIUM_REQUIRED' ? 'Tezliklə' : 'Başlamaq olmadı'}</h1>
        </div>
        <p>{error.code === 'PREMIUM_REQUIRED' ? 'Bu imkan Premium ilə açılacaq. Premium tezliklə; hazırda Konstitusiya mövzusu hamı üçün açıqdır.' : error.message}</p>
        {lockedUntil && <p className="muted">Ulduzlar {untilText(lockedUntil)} sonra bərpa olunacaq.</p>}
        {next && <p className="muted">Növbəti cəhd {untilText(next)} sonra mümkündür.</p>}
        {error.code === 'HEARTS_LOCKED' && <button className="btn primary block" onClick={() => nav({ name: 'session', kind: 'review', back })}>Təkrar et və ulduz qaytar</button>}
        {error.code === 'HEARTS_LOCKED' && <button className="btn secondary block" onClick={() => comingSoon('Tükənməyən ulduzlar')}>Premium: ulduzlar tükənmir — tezliklə</button>}
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
              {revealed ? <QaAnswer text={c.body} /> : (
                <button className="btn secondary block" onClick={() => setRevealed(true)}>Cavabı göstər</button>
              )}
            </>
          ) : c.kind === 'note' ? (
            <>
              <div className="head note-head"><IconInfo /><span>Qeyd</span></div>
              <div className="body"><Marked text={c.body} /></div>
            </>
          ) : (
            <>
              {c.title && <div className="head">{c.title}</div>}
              {c.heat != null && c.heat >= 2 && <HeatBadge heat={c.heat} count={c.examCount ?? 0} />}
              <LawText text={c.body} />
            </>
          )}
        </article>
        {c.facts && c.facts.length > 0 && (
          <aside className="facts">
            <b>Yadda saxla</b>
            <ul>{c.facts.map((f, i) => <li key={i}><Marked text={f} /></li>)}</ul>
          </aside>
        )}
        {c.kind === 'qa' && <p className="tiny muted">Əvvəlcə cavabı özün xatırlamağa çalış, sonra yoxla.</p>}
        {c.kind === 'note' && <p className="tiny muted">Bu, yadda saxlamaq üçün qısa izahdır, qanunun mətni deyil.</p>}
        {c.kind === 'law' && <p className="tiny muted">Mənbə: qanunun mətni. <span className="hl-num">Rəqəmlər</span>, <span className="hl-org">orqanlar</span> və <span className="hl-mod">qadağalar</span> rənglə seçilib; [izah: …] qanunun sözü deyil, müəllif qeydidir. Rəsmi redaksiya e-qanun.az-dadır.</p>}
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
        {q.format === 'cloze' ? (
          <>
            <span className="chip num">Rəqəm məşqi · qanunun mətni</span>
            <p className="stem cloze"><ClozeStem text={q.stem} /></p>
          </>
        ) : <p className="stem"><DottedStem text={q.stem} /></p>}
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

function Result({ r, back, cards }: { r: CompleteDto; back: Route; cards: CardDto[] }) {
  const { nav } = useApp();
  const exam = r.kind === 'final' || r.kind === 'mock' || r.kind === 'section' || r.kind === 'competition';
  const mistakes = r.review.filter((x) => !x.correct);
  const title = !r.completed ? 'Dərs dayandı' : r.kind === 'competition' ? 'Yarış cəhdin qeydə alındı' : exam ? (r.passed ? 'Keçdin!' : 'Keçid balı toplanmadı') : r.kind === 'lesson' ? 'Dərs bitdi!' : r.kind === 'drill' ? 'Məşq bitdi!' : 'Təkrar bitdi!';
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
          <p className="muted">İlk cəhddə düzgün: {r.correct} / {r.total}</p>
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
      {!r.completed && <div className="banner bad"><IconAlert /><span>Ulduzlar bitdiyi üçün dərs bitmiş sayılmadı{r.rank.meritDelta < 0 ? ' və xidmət balı azaldı' : ''}. Səhv etdiyin suallar təkrar cədvəlinə düşüb: təkrarda 10 sualdan 8-ni düz cavablandırsan, paqonuna ulduz qayıdır.</span></div>}
      {LB_NOTES[r.leaderboard] && <div className="banner warn"><IconAlert />{LB_NOTES[r.leaderboard]}</div>}
      {r.kind === 'mock' && <p className="small muted">Sınaq yalnız qanunvericilik bölməsini (40 tapşırıq) ölçür. Real imtahanda keçid balı dörd fənnin cəmi üzrə hesablanır.</p>}

      {r.kind === 'lesson' && r.completed && cards.some((c) => c.facts?.length) && (
        <section className="stack">
          <h2>Dərsin əsas faktları</h2>
          <aside className="facts">
            <ul>{cards.flatMap((c) => (c.facts ?? []).map((f, i) => <li key={`${c.id}-${i}`}><Marked text={f} />{c.ref ? <span className="tiny muted"> · {c.ref}</span> : null}</li>))}</ul>
          </aside>
        </section>
      )}

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

// ---------------------------------------------------------------- lesson 2.0 helpers

function LessonIntro({ session, onStart, onSkip }: { session: SessionDto; onStart: () => void; onSkip: () => void }) {
  const law = session.cards.filter((c) => c.kind === 'law');
  const facts = session.cards.reduce((a, c) => a + (c.facts?.length ?? 0), 0);
  const hot = law.filter((c) => (c.heat ?? 0) >= 2).length;
  const drills = session.questions.filter((q) => q.format === 'cloze').length;
  const minutes = Math.max(3, Math.round(session.cards.length * 0.8 + session.questions.length * 0.5));
  return (
    <>
      <main className="session-body stack loose">
        <div className="stack tight">
          <span className="tiny muted">{session.subtitle}</span>
          <h1>{session.title}</h1>
          <p className="muted">Təxminən {minutes} dəqiqə</p>
        </div>
        <ol className="lesson-steps">
          <li><b>Öyrən</b><span>{law.length} maddə{facts ? ` · ${facts} əsas fakt` : ''}{hot ? (hot === law.length ? ' · hamısı imtahanda tez-tez soruşulur' : ` · imtahanda tez-tez soruşulan: ${hot}`) : ''}</span></li>
          <li><b>Yoxla</b><span>{session.questions.length} sual{drills ? `, onlardan ${drills}-i qanunun mətnindən rəqəm məşqi` : ''}</span></li>
          <li><b>Yekun</b><span>Əsas faktlar və səhv etdiyin suallar qanunun sözləri ilə</span></li>
        </ol>
        <p className="small muted">Qanunun mətnində rəqəmlər, müddətlər, orqanlar və qadağalar rənglə seçilir — imtahanda ən çox onlar soruşulur.</p>
      </main>
      <div className="sheet">
        <div className="sheet-inner">
          <button className="btn primary block" onClick={onStart}>Başla</button>
          <button className="btn ghost small" onClick={onSkip}>Mətni bilirəm, suallara keç</button>
        </div>
      </div>
    </>
  );
}

function HeatBadge({ heat, count }: { heat: number; count: number }) {
  return (
    <span className={`heat h${heat}`} title={`Bu mətnə aid ${count} imtahan sualı var`}>
      <span style={{ width: 16, display: 'inline-flex' }}><IconFlame /></span>
      {heat >= 3 ? 'İmtahanın sevimlisi' : 'İmtahanda tez-tez soruşulur'} · {count} sual
    </span>
  );
}

const NUM_WORDS = 'on beş|bir|iki|üç|dörd|beş|altı|yeddi|səkkiz|doqquz|on|iyirmi|otuz|qırx|əlli|altmış|doxsan|yüz';
const UNIT = '(?:iş günü|təqvim günü|gün|həftə|ay|il|saat|faiz|səs çoxluğu|deputat|nəfər|hakim|manat)\\p{L}*';
const NB = '(?<![\\p{L}\\d])'; // no letter or digit right before
const NA = '(?![\\p{L}])';     // no letter right after
const MARK = new RegExp(
  '(\\[izah: [^\\]]+\\])'
  + `|(${NB}(?:\\d{1,3}(?:[.,]\\d+)?|${NUM_WORDS})(?:-\\p{L}+)?\\s+${UNIT}|${NB}(?:ən geci|dərhal|gec olmayaraq)${NA})`
  + `|(${NB}(?:Milli Məclis|Prezident|Konstitusiya Məhkəməsi|Ali Məhkəmə|Nazirlər Kabineti|Baş prokuror|Mərkəzi Bank|Müvəkkil|Prokurorluq|apellyasiya məhkəmələri)\\p{L}*)`
  + `|(${NB}(?:qadağandır|yol verilmir|bilməz|bilməzlər|yalnız|məcburidir)${NA})`,
  'gu',
);

/** Law text with numbers and deadlines, organs, prohibitions and author's notes marked. */
function Marked({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(MARK)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const cls = m[1] ? 'hl-note' : m[2] ? 'hl-num' : m[3] ? 'hl-org' : 'hl-mod';
    out.push(<span key={k++} className={cls}>{m[0]}</span>);
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

/**
 * Law text split into its parts: "I."/"II." parts and "28.1." clauses become paragraphs, "1)"/"a)" points become
 * list rows, so a long article reads like the official layout instead of one block.
 */
const PART = /\s+(?=(?:[IVX]{1,6}|\d{1,3}(?:-\d+)?(?:\.\d+){1,3})\.\s+\S)/u;
const POINT = /(?<=[:;])\s+(?=(?:\d{1,2}(?:-\d)?|[a-zçğıöşüə])\)\s)/u;
const LEAD = /^((?:[IVX]{1,6}|\d{1,3}(?:-\d+)?(?:\.\d+){0,3})[.)]|[a-zçğıöşüə]\))\s+/u;

export function LawText({ text }: { text: string }) {
  const paras = text.split(PART).filter(Boolean);
  return (
    <div className="body law-text">
      {paras.map((p, i) => {
        const [first, ...points] = p.split(POINT);
        return (
          <div key={i} className="lt-para">
            <LeadLine text={first} />
            {points.length > 0 && <ul className="lt-points">{points.map((x, j) => <li key={j}><LeadLine text={x} /></li>)}</ul>}
          </div>
        );
      })}
    </div>
  );
}

function LeadLine({ text }: { text: string }) {
  const m = text.match(LEAD);
  if (!m) return <p><Marked text={text} /></p>;
  return <p><span className="lt-no">{m[1]}</span><Marked text={text.slice(m[0].length)} /></p>;
}

/** A Q&A answer; notes glued to it ("Qeyd: ...") are shown as callouts under the answer. */
function QaAnswer({ text }: { text: string }) {
  const [answer, ...notes] = text.split(/\n\n(?=Qeyd:)/);
  return (
    <div className="body qa-answer">
      <p>{answer}</p>
      {notes.map((n, i) => <p key={i} className="qa-note"><b>Qeyd.</b> {n.replace(/^Qeyd:\s*/, '')}</p>)}
    </div>
  );
}

/** Older test questions mark the gap with a row of dots ("......."); show it as a blank line instead. */
function DottedStem({ text }: { text: string }) {
  const parts = text.split(/\s*\.{5,}\s*/);
  if (parts.length === 1) return <>{text}</>;
  return <>{parts.map((p, i) => <span key={i}>{i > 0 && <span className="blank" aria-label="boşluq" />}{i > 0 && p && !/^[?.,;:]/.test(p) ? ' ' : ''}{p}</span>)}</>;
}

function ClozeStem({ text }: { text: string }) {
  const [pre, post] = text.split('_____');
  if (post === undefined) return <>{text}</>;
  return <>{pre}<span className="blank" aria-label="boşluq">______</span>{post}</>;
}
