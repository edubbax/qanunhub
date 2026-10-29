// Editor/admin panel: content QA and editing, learner reports, users, import, outgoing mail and audit log.
import type { Card, ContentBundle, Item, ItemStatus } from '@qanunhub/core';
import { useEffect, useState } from 'react';
import { useApp } from '../app';
import type { AdminLesson, AdminReport, AdminTopic, AdminUser, ItemFilter, ItemPatch } from '../api/types';
import { ErrorBox, formatDate, formatTime, Modal, Spinner, toast, useLoad } from '../ui/components';
import { IconBack } from '../ui/icons';
import { CertificateModal } from './Competitions';

type Tab = 'overview' | 'content' | 'reports' | 'users' | 'competitions' | 'import' | 'mail' | 'audit' | 'payments';

export const FLAG_LABELS: Record<string, string> = {
  no_key: 'Cavab açarı tapılmayıb',
  key_conflict: 'Fərqli fayllarda fərqli açar',
  key_corrected: 'Açar hüquqşünas tərəfindən düzəldilib',
  dup_options: 'Təkrarlanan variantlar',
  options: 'Variant sayı qeyri-adi',
  stem_length: 'Sual mətni qeyri-adi uzunluqda',
  outdated: 'Köhnəlmiş termin ola bilər',
  garbled: 'PDF mətni pozulub',
  scope: 'Kateqoriya aidiyyəti şübhəli',
};

const STATUS_LABELS: Record<ItemStatus, string> = { published: 'Dərc olunub', draft: 'Qaralama', review: 'Yoxlamada', flagged: 'Bloklanıb' };
const REASONS: Record<string, string> = { wrong_answer: 'Səhv cavab', outdated: 'Köhnəlmiş', typo: 'Yazı səhvi', unclear: 'Aydın deyil', other: 'Başqa' };

export function Admin() {
  const { me, nav } = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const [focusItem, setFocusItem] = useState<string | null>(null);
  if (!me || me.role === 'user') {
    return <main className="page no-tabs"><ErrorBox error={new Error('Bu bölməyə giriş icazəniz yoxdur.')} /></main>;
  }
  const tabs: [Tab, string][] = [
    ['overview', 'Ümumi'], ['content', 'Məzmun'], ['reports', 'Şikayətlər'],
    ...(me.role === 'admin' ? ([['users', 'İstifadəçilər']] as [Tab, string][]) : []),
    ['competitions', 'Yarışlar'],
    ['import', 'İdxal'], ['mail', 'Poçt'], ['audit', 'Audit'], ['payments', 'Ödənişlər'],
  ];
  return (
    <main className="page no-tabs stack">
      <div className="row between">
        <button className="btn ghost" onClick={() => nav({ name: 'profile' })}><IconBack />Tətbiqə qayıt</button>
        <span className="chip primary">{me.role === 'admin' ? 'Administrator' : 'Redaktor'}</span>
      </div>
      <h1>İdarəetmə paneli</h1>
      <nav className="admin-nav" aria-label="Admin bölmələri">
        {tabs.map(([k, label]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
      </nav>
      {tab === 'overview' && <Overview go={setTab} />}
      {tab === 'content' && <Content focusItem={focusItem} clearFocus={() => setFocusItem(null)} />}
      {tab === 'reports' && <Reports openItem={(id) => { setFocusItem(id); setTab('content'); }} />}
      {tab === 'users' && <Users />}
      {tab === 'competitions' && <AdminCompetitions />}
      {tab === 'import' && <Import />}
      {tab === 'mail' && <Mail />}
      {tab === 'audit' && <Audit />}
      {tab === 'payments' && (
        <div className="card stack">
          <h2>Ödənişlər</h2>
          <p className="muted">Onlayn ödəniş növbəti mərhələdə qoşulacaq. Sxemdə <code>subscriptions</code> və <code>payments</code> cədvəlləri artıq var. Hələlik Premium «İstifadəçilər» bölməsindən əl ilə verilir.</p>
        </div>
      )}
    </main>
  );
}

function Overview({ go }: { go: (t: Tab) => void }) {
  const { api } = useApp();
  const { data, error, reload } = useLoad(() => api.admin.overview(), []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const published = data.items.find((i) => i.status === 'published')?.n ?? 0;
  const total = data.items.reduce((a, i) => a + i.n, 0);
  return (
    <div className="stack loose">
      <section className="kv">
        <div className="card"><span className="tiny muted">İstifadəçi</span><b>{data.users.users}</b><span className="tiny muted">həftədə yeni: {data.users.new_week}</span></div>
        <div className="card"><span className="tiny muted">Premium</span><b>{data.users.premium}</b></div>
        <div className="card"><span className="tiny muted">Aktiv (gün / həftə)</span><b>{data.users.active_day} / {data.users.active_week}</b></div>
        <div className="card"><span className="tiny muted">Sessiya (24 saat)</span><b>{data.sessionsDay.sessions}</b><span className="tiny muted">bitən: {data.sessionsDay.completed}</span></div>
        <button className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go('reports')}><span className="tiny muted">Açıq şikayət</span><b style={{ color: data.reports.open ? 'var(--bad)' : undefined }}>{data.reports.open}</b></button>
      </section>
      <section className="admin-grid split">
        <div className="card stack">
          <h2>Məzmun</h2>
          <p className="small muted">Versiya {data.content.version}</p>
          <div className="kv">
            <div><span className="tiny muted">Mövzu</span><b className="num" style={{ display: 'block', fontSize: '1.3rem' }}>{data.content.topics}</b></div>
            <div><span className="tiny muted">Dərs</span><b className="num" style={{ display: 'block', fontSize: '1.3rem' }}>{data.content.lessons}</b></div>
            <div><span className="tiny muted">İzah kartı</span><b className="num" style={{ display: 'block', fontSize: '1.3rem' }}>{data.content.cards}</b></div>
            <div><span className="tiny muted">Sual (dərc / cəmi)</span><b className="num" style={{ display: 'block', fontSize: '1.3rem' }}>{published} / {total}</b></div>
          </div>
        </div>
        <div className="card stack">
          <h2>Keyfiyyət bayraqları</h2>
          <p className="small muted">Pipeline-ın avtomatik işarələri. «Cavab açarı tapılmayıb» və «Fərqli açar» olan suallar hüquqşünas təsdiqləyənə qədər dərc olunmur.</p>
          <table className="data">
            <tbody>
              {data.flags.map((f) => <tr key={f.flag}><td>{FLAG_LABELS[f.flag] ?? f.flag}</td><td className="num" style={{ textAlign: 'right' }}>{f.n}</td></tr>)}
              {data.flags.length === 0 && <tr><td className="muted">Bayraq yoxdur</td></tr>}
            </tbody>
          </table>
          <button className="btn secondary small" style={{ alignSelf: 'flex-start' }} onClick={() => go('content')}>Sualları yoxla</button>
        </div>
      </section>
    </div>
  );
}

function Content({ focusItem, clearFocus }: { focusItem: string | null; clearFocus: () => void }) {
  const { api } = useApp();
  const topics = useLoad(() => api.admin.topics(), []);
  const [filter, setFilter] = useState<ItemFilter>({ status: '', flag: '', q: '', page: 0 });
  const [q, setQ] = useState('');
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [cardsFor, setCardsFor] = useState<AdminLesson | null>(null);
  const items = useLoad(() => api.admin.items(filter), [JSON.stringify(filter)]);
  const [editing, setEditing] = useState<Item | null>(null);

  useEffect(() => {
    if (!filter.topicId) { setLessons([]); return; }
    api.admin.lessons(filter.topicId).then(setLessons, () => setLessons([]));
  }, [api, filter.topicId]);

  useEffect(() => {
    if (!focusItem) return;
    // Opened from a report: find the item by id across all items.
    (async () => {
      let page = 0;
      for (;;) {
        const r = await api.admin.items({ page });
        const hit = r.items.find((i) => i.id === focusItem);
        if (hit) { setEditing(hit); break; }
        if ((page + 1) * 50 >= r.total) break;
        page++;
      }
      clearFocus();
    })().catch(() => clearFocus());
  }, [api, focusItem, clearFocus]);

  const set = (p: Partial<ItemFilter>) => setFilter((f) => ({ ...f, page: 0, ...p }));
  const topicTitle = (id: string) => topics.data?.find((t) => t.id === id)?.shortTitle ?? id;

  return (
    <div className="stack">
      <div className="row wrap">
        <select className="input" style={{ width: 'auto', minWidth: 220 }} value={filter.topicId ?? ''} onChange={(e) => set({ topicId: e.target.value || undefined, lessonId: undefined })} aria-label="Mövzu">
          <option value="">Bütün mövzular</option>
          {topics.data?.map((t: AdminTopic) => <option key={t.id} value={t.id}>{t.programNo}. {t.shortTitle} ({t.published}/{t.items}{t.flagged ? `, ⚑${t.flagged}` : ''})</option>)}
        </select>
        {lessons.length > 0 && (
          <select className="input" style={{ width: 'auto', minWidth: 200 }} value={filter.lessonId ?? ''} onChange={(e) => set({ lessonId: e.target.value || undefined })} aria-label="Dərs">
            <option value="">Bütün dərslər</option>
            {lessons.map((l) => <option key={l.id} value={l.id}>{l.order}. {l.title} ({l.items})</option>)}
          </select>
        )}
        <select className="input" style={{ width: 'auto' }} value={filter.status ?? ''} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
          <option value="">Hər status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={filter.flag ?? ''} onChange={(e) => set({ flag: e.target.value })} aria-label="Bayraq">
          <option value="">Hər bayraq</option>
          {Object.entries(FLAG_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <form className="row grow" style={{ minWidth: 220 }} onSubmit={(e) => { e.preventDefault(); set({ q }); }}>
          <input className="input" placeholder="Sual mətnində axtar" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn secondary">Axtar</button>
        </form>
      </div>
      {filter.lessonId && (
        <button className="btn secondary small" style={{ alignSelf: 'flex-start' }} onClick={() => setCardsFor(lessons.find((l) => l.id === filter.lessonId) ?? null)}>
          Dərsin izah kartlarını redaktə et
        </button>
      )}

      {items.error ? <ErrorBox error={items.error} onRetry={items.reload} /> : null}
      {!items.data && !items.error && <Spinner />}
      {items.data && (
        <>
          <p className="small muted">{items.data.total} sual tapıldı</p>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Sual</th><th>Mövzu</th><th>Növ</th><th>Status</th><th>Bayraqlar</th><th>Mənbə</th></tr></thead>
              <tbody>
                {items.data.items.map((i) => (
                  <tr key={i.id} className="click" onClick={() => setEditing(i)}>
                    <td style={{ maxWidth: 420 }}>{i.stem.length > 160 ? i.stem.slice(0, 160) + '…' : i.stem}</td>
                    <td>{topicTitle(i.topicId)}</td>
                    <td>{i.type === 'multi' ? 'Açıq' : 'Qapalı'}</td>
                    <td><span className={`chip ${i.status === 'published' ? 'ok' : i.status === 'flagged' ? 'bad' : 'xp'}`}>{STATUS_LABELS[i.status]}</span></td>
                    <td className="tiny">{i.flags.map((f) => FLAG_LABELS[f] ?? f).join(', ')}</td>
                    <td className="tiny muted">{i.pool === 'formative' ? 'Formativ (redaktor)' : i.source ? `${i.source.file}${i.source.no ? ` №${i.source.no}` : ''}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn secondary small" disabled={!filter.page} onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 0) - 1 }))}>Əvvəlki</button>
            <span className="small muted">Səhifə {(filter.page ?? 0) + 1} / {Math.max(1, Math.ceil(items.data.total / 50))}</span>
            <button className="btn secondary small" disabled={((filter.page ?? 0) + 1) * 50 >= items.data.total} onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 0) + 1 }))}>Növbəti</button>
          </div>
        </>
      )}
      {editing && <ItemEditor item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); items.reload(); topics.reload(); }} />}
      {cardsFor && <CardsEditor lesson={cardsFor} onClose={() => setCardsFor(null)} />}
    </div>
  );
}

function ItemEditor({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const { api } = useApp();
  const [stem, setStem] = useState(item.stem);
  const [statements, setStatements] = useState((item.statements ?? []).join('\n'));
  const [options, setOptions] = useState<string[]>(item.options);
  const [answer, setAnswer] = useState<number[]>(item.answer);
  const [explanation, setExplanation] = useState(item.explanation ?? '');
  const [ref, setRef] = useState(item.ref ?? '');
  const [status, setStatus] = useState<ItemStatus>(item.status);
  const [flags, setFlags] = useState<string[]>(item.flags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stats = useLoad(() => api.admin.itemStats(item.id), [item.id]);
  const multi = item.type === 'multi';

  const toggleAnswer = (i: number) => setAnswer((a) => (multi ? (a.includes(i) ? a.filter((x) => x !== i) : [...a, i].sort((x, y) => x - y)) : [i]));

  const save = async () => {
    setBusy(true);
    setError(null);
    const patch: ItemPatch = {
      stem: stem.trim(),
      statements: statements.trim() ? statements.split('\n').map((s) => s.trim()).filter(Boolean) : undefined,
      options: options.map((o) => o.trim()),
      answer,
      explanation: explanation.trim() || undefined,
      ref: ref.trim() || undefined,
      status,
      flags,
    };
    try {
      await api.admin.updateItem(item.id, patch);
      toast('Sual yadda saxlanıldı.');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="row between">
        <h2>Sualın redaktəsi</h2>
        <span className="tiny muted">{item.id}</span>
      </div>
      <p className="tiny muted">
        {item.type === 'multi' ? 'Açıq tapşırıq (2 bal, bir neçə düzgün cavab)' : 'Qapalı tapşırıq (1 düzgün cavab)'} · kateqoriyalar {item.categories.join(', ')}
        {item.source ? ` · mənbə: ${item.source.file}${item.source.no ? ` №${item.source.no}` : ''}` : ''}
        {item.pool === 'formative' ? ' · formativ sual: yalnız dərslərdə soruşulur' : ' · bölmə testi, final və sınaqda soruşulur'}
      </p>
      {stats.data && (
        <p className="tiny muted">Statistika: {stats.data.answered} cavab, düzgün {stats.data.answered ? Math.round((stats.data.correct / stats.data.answered) * 100) : 0}%, orta vaxt {Math.round(stats.data.avg_ms / 1000)} san.</p>
      )}
      <div className="field"><label htmlFor="ie-stem">Sual</label><textarea id="ie-stem" className="input" value={stem} onChange={(e) => setStem(e.target.value)} /></div>
      {(item.statements || statements) && (
        <div className="field"><label htmlFor="ie-st">Nömrəli müddəalar (hər sətir bir müddəa)</label><textarea id="ie-st" className="input" value={statements} onChange={(e) => setStatements(e.target.value)} /></div>
      )}
      <div className="field">
        <label>Variantlar və düzgün cavab{multi ? 'lar' : ''}</label>
        {options.map((o, i) => (
          <div key={i} className="opt-edit">
            <input type={multi ? 'checkbox' : 'radio'} name="ie-answer" checked={answer.includes(i)} onChange={() => toggleAnswer(i)} aria-label={`Variant ${i + 1} düzgündür`} />
            <textarea className="input" style={{ minHeight: 48 }} value={o} onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? e.target.value : x)))} />
          </div>
        ))}
      </div>
      <div className="field"><label htmlFor="ie-ex">İzah (cavabdan sonra göstərilir)</label><textarea id="ie-ex" className="input" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Məs.: Konstitusiyanın 7-ci maddəsinə əsasən…" /></div>
      <div className="row wrap">
        <div className="field grow"><label htmlFor="ie-ref">İstinad</label><input id="ie-ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="m. 7.2" /></div>
        <div className="field grow">
          <label htmlFor="ie-status">Status</label>
          <select id="ie-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {flags.length > 0 && (
        <div className="field">
          <label>Bayraqlar (yoxladıqdan sonra götür)</label>
          <div className="row wrap">
            {flags.map((f) => <button key={f} type="button" className="chip xp" style={{ border: 0, cursor: 'pointer' }} onClick={() => setFlags((fs) => fs.filter((x) => x !== f))}>{FLAG_LABELS[f] ?? f} ✕</button>)}
          </div>
        </div>
      )}
      {error && <div className="banner bad" role="alert">{error}</div>}
      <div className="row">
        <button className="btn secondary" onClick={onClose}>Ləğv et</button>
        <button className="btn primary grow" disabled={busy || answer.length === 0} onClick={save}>Yadda saxla</button>
      </div>
    </Modal>
  );
}

function CardsEditor({ lesson, onClose }: { lesson: AdminLesson; onClose: () => void }) {
  const { api } = useApp();
  const { data, error, reload } = useLoad(() => api.admin.cards(lesson.id), [lesson.id]);
  return (
    <Modal onClose={onClose}>
      <h2>{lesson.title}: izah kartları</h2>
      {error ? <ErrorBox error={error} onRetry={reload} /> : null}
      {!data && !error && <Spinner />}
      {data?.map((c) => <CardEdit key={c.id} card={c} />)}
      <button className="btn secondary block" onClick={onClose}>Bağla</button>
    </Modal>
  );
}

function CardEdit({ card }: { card: Card }) {
  const { api } = useApp();
  const [title, setTitle] = useState(card.title ?? '');
  const [body, setBody] = useState(card.body);
  const [busy, setBusy] = useState(false);
  const dirty = title !== (card.title ?? '') || body !== card.body;
  return (
    <div className="card flat stack tight">
      <span className="tiny muted">{card.kind === 'law' ? 'Qanun mətni' : card.kind === 'qa' ? 'Sual-cavab' : 'Qeyd'} · {card.ref ?? ''}</span>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Başlıq" />
      <textarea className="input" style={{ minHeight: 140 }} value={body} onChange={(e) => setBody(e.target.value)} />
      <button className="btn secondary small" style={{ alignSelf: 'flex-end' }} disabled={!dirty || busy} onClick={async () => {
        setBusy(true);
        try {
          await api.admin.updateCard(card.id, { title: title.trim() || null, body });
          toast('Kart yadda saxlanıldı.');
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Xəta baş verdi.');
        } finally {
          setBusy(false);
        }
      }}>Yadda saxla</button>
    </div>
  );
}

function Reports({ openItem }: { openItem: (id: string) => void }) {
  const { api } = useApp();
  const [status, setStatus] = useState('open');
  const { data, error, reload } = useLoad(() => api.admin.reports(status), [status]);
  const [resolving, setResolving] = useState<AdminReport | null>(null);
  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="Status">
        {[['open', 'Açıq'], ['confirmed', 'Təsdiqlənib'], ['rejected', 'Rədd edilib']].map(([k, v]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{v}</button>)}
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : null}
      {!data && !error && <Spinner />}
      {data && data.length === 0 && <p className="empty card flat">Şikayət yoxdur.</p>}
      {data && data.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Tarix</th><th>Səbəb</th><th>Sual</th><th>Qeyd</th><th>İstifadəçi</th><th /></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="tiny">{formatTime(r.createdAt)}</td>
                  <td><span className="chip">{REASONS[r.reason] ?? r.reason}</span></td>
                  <td style={{ maxWidth: 360 }}><button className="btn ghost small" style={{ padding: 0, textAlign: 'left', minHeight: 0 }} onClick={() => openItem(r.itemId)}>{(r.stem ?? r.itemId).slice(0, 140)}</button></td>
                  <td className="small">{r.body || '—'}{r.resolution ? <><br /><span className="tiny muted">Cavab: {r.resolution}</span></> : null}</td>
                  <td className="small">{r.nickname}</td>
                  <td>{r.status === 'open' && <button className="btn secondary small" onClick={() => setResolving(r)}>Bax</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resolving && <ResolveModal r={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); reload(); }} openItem={openItem} />}
    </div>
  );
}

function ResolveModal({ r, onClose, onDone, openItem }: { r: AdminReport; onClose: () => void; onDone: () => void; openItem: (id: string) => void }) {
  const { api } = useApp();
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (status: 'confirmed' | 'rejected') => {
    setBusy(true);
    try {
      await api.admin.resolveReport(r.id, status, resolution);
      toast(status === 'confirmed' ? 'Təsdiqləndi, istifadəçiyə +20 XP verildi.' : 'Rədd edildi.');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Xəta baş verdi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose}>
      <h2>Şikayət: {REASONS[r.reason] ?? r.reason}</h2>
      <p className="small">{r.stem}</p>
      {r.body && <div className="banner">{r.body}</div>}
      <button className="btn secondary small" style={{ alignSelf: 'flex-start' }} onClick={() => { onClose(); openItem(r.itemId); }}>Sualı redaktə et</button>
      <div className="field"><label htmlFor="rs-res">Qərar haqqında qeyd</label><textarea id="rs-res" className="input" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Məs.: Açar düzəldildi, 2024-cü il dəyişikliyinə uyğunlaşdırıldı." /></div>
      <div className="row">
        <button className="btn danger grow" disabled={busy} onClick={() => act('rejected')}>Rədd et</button>
        <button className="btn ok grow" disabled={busy} onClick={() => act('confirmed')}>Təsdiqlə (+20 XP)</button>
      </div>
    </Modal>
  );
}

function Users() {
  const { api, me } = useApp();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, reload } = useLoad(() => api.admin.users(query), [query]);
  const update = async (u: AdminUser, patch: Parameters<typeof api.admin.updateUser>[1]) => {
    try {
      await api.admin.updateUser(u.id, patch);
      toast('Yeniləndi.');
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Xəta baş verdi.');
    }
  };
  return (
    <div className="stack">
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <input className="input" placeholder="Email və ya ləqəb" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn secondary">Axtar</button>
      </form>
      {error ? <ErrorBox error={error} onRetry={reload} /> : null}
      {!data && !error && <Spinner />}
      {data && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>İstifadəçi</th><th>Kateqoriya</th><th>XP</th><th>Premium</th><th>Rol</th><th>Email</th><th>Reytinq</th></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.nickname}</b><br /><span className="tiny muted">{u.email}</span><br /><span className="tiny muted">qeydiyyat {formatDate(u.createdAt)}</span></td>
                  <td>{u.category ?? '—'}{u.subgroup ? ` · ${u.subgroup}` : ''}</td>
                  <td className="num">{u.xpTotal}</td>
                  <td>
                    {u.premiumUntil && u.premiumUntil > Date.now() ? <span className="chip ok">{formatDate(u.premiumUntil)}</span> : <span className="chip">yox</span>}
                    <div className="row" style={{ marginTop: 4 }}>
                      <button className="btn ghost small" onClick={() => update(u, { premiumUntil: Math.max(Date.now(), u.premiumUntil ?? 0) + 30 * 86400_000 })}>+30 gün</button>
                      {u.premiumUntil && <button className="btn ghost small" onClick={() => update(u, { premiumUntil: null })}>Ləğv</button>}
                    </div>
                  </td>
                  <td>
                    <select className="input" style={{ minHeight: 36, padding: '4px 8px' }} value={u.role} disabled={u.id === me?.id} onChange={(e) => update(u, { role: e.target.value as AdminUser['role'] })}>
                      <option value="user">İstifadəçi</option>
                      <option value="editor">Redaktor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{u.emailVerified ? <span className="chip ok">təsdiqli</span> : <button className="btn ghost small" onClick={() => update(u, { emailVerified: true })}>Təsdiqlə</button>}</td>
                  <td><label className="check"><input type="checkbox" checked={u.leaderboardBanned} onChange={(e) => update(u, { leaderboardBanned: e.target.checked })} />Blok</label></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Import() {
  const { api } = useApp();
  const [bundle, setBundle] = useState<ContentBundle | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card stack">
      <h2>Məzmun idxalı</h2>
      <p className="small muted">
        Pipeline-ın yaratdığı <code>content.json</code> faylını seç (<code>python3 tools/content/build.py</code>). Redaktorların əl ilə düzəltdiyi suallar və kartlar saxlanılır;
        istifadəçilərin təkrar tarixçəsi sual ID-ləri sabit qaldığı üçün itmir.
      </p>
      <input type="file" accept="application/json,.json" onChange={async (e) => {
        setError(null);
        setResult(null);
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          const b = JSON.parse(await f.text()) as ContentBundle;
          if (!b.version || !Array.isArray(b.items) || !Array.isArray(b.topics)) throw new Error('Fayl QanunHub məzmun formatında deyil.');
          setBundle(b);
          setName(f.name);
        } catch (err) {
          setBundle(null);
          setError(err instanceof Error ? err.message : 'Fayl oxunmadı.');
        }
      }} />
      {bundle && <p className="small">{name}: versiya {bundle.version}, {bundle.topics.length} mövzu, {bundle.lessons.length} dərs, {bundle.items.length} sual.</p>}
      {error && <div className="banner bad">{error}</div>}
      {result && <div className="banner">{result}</div>}
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={!bundle || busy} onClick={async () => {
        setBusy(true);
        try {
          const r = await api.admin.importContent(bundle!);
          setResult(`İdxal olundu: ${r.topics} mövzu, ${r.lessons} dərs, ${r.items} sual. Saxlanılan redaktələr: ${r.keptEdited}.`);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'İdxal alınmadı.');
        } finally {
          setBusy(false);
        }
      }}>İdxal et</button>
    </div>
  );
}

function Mail() {
  const { api } = useApp();
  const { data, error, reload } = useLoad(() => api.admin.mail(), []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  return (
    <div className="stack">
      <p className="small muted">Göndərilən məktublar (MAIL_MODE=outbox rejimində burada saxlanılır; SMTP qoşulanda real göndərilir).</p>
      {data.length === 0 && <p className="empty card flat">Məktub yoxdur.</p>}
      {data.map((m) => (
        <div key={m.id} className="card flat">
          <div className="row between"><b className="small">{m.subject}</b><span className="tiny muted">{formatTime(m.createdAt)}</span></div>
          <span className="tiny muted">{m.to}</span>
          <pre className="mail">{m.body}</pre>
        </div>
      ))}
    </div>
  );
}

function Audit() {
  const { api } = useApp();
  const { data, error, reload } = useLoad(() => api.admin.audit(), []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>Vaxt</th><th>Kim</th><th>Əməliyyat</th><th>Obyekt</th></tr></thead>
        <tbody>
          {data.map((a) => <tr key={a.id}><td className="tiny">{formatTime(a.createdAt)}</td><td>{a.actor ?? '—'}</td><td><code>{a.action}</code></td><td className="tiny">{a.entity} {a.entityId}</td></tr>)}
          {data.length === 0 && <tr><td colSpan={4} className="muted">Qeyd yoxdur.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function toLocalInput(ts: number): string {
  const d = new Date(ts + 4 * 3600_000);
  return d.toISOString().slice(0, 16);
}

function fromLocalInput(v: string): number {
  return new Date(v + ':00Z').getTime() - 4 * 3600_000;
}

/** Create competitions, end them early and download the winners' certificates. */
function AdminCompetitions() {
  const { api, me } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.admin.competitions(), []);
  const now = Date.now();
  const [form, setForm] = useState({
    title: '', description: '', category: '' as '' | 'AC' | 'BA' | 'BB',
    startsAt: toLocalInput(now), endsAt: toLocalInput(now + 7 * 86400_000), questionCount: 20, minutes: 20,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cert, setCert] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.admin.createCompetition({
        title: form.title, description: form.description, category: form.category || null,
        startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt), questionCount: Number(form.questionCount), timeLimitSec: Number(form.minutes) * 60,
      });
      toast('Yarış yaradıldı.');
      setForm({ ...form, title: '', description: '' });
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Xəta baş verdi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-grid split">
      <section className="card stack">
        <h2>Yeni yarış</h2>
        {me?.role !== 'admin' && <p className="small muted">Yarışı yalnız administrator yarada bilər.</p>}
        <div className="field"><label htmlFor="ac-title">Ad</label><input id="ac-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Məsələn, Həftəlik yarış" /></div>
        <div className="field"><label htmlFor="ac-desc">Təsvir</label><textarea id="ac-desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="field"><label htmlFor="ac-cat">Kateqoriya</label>
          <select id="ac-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as typeof form.category })}>
            <option value="">Hamısı (hər kəs öz kateqoriyası üzrə)</option><option value="AC">AC</option><option value="BA">BA</option><option value="BB">BB</option>
          </select>
        </div>
        <div className="row wrap">
          <div className="field grow"><label htmlFor="ac-start">Başlanğıc (Bakı vaxtı)</label><input id="ac-start" className="input" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div>
          <div className="field grow"><label htmlFor="ac-end">Bitmə</label><input id="ac-end" className="input" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></div>
        </div>
        <div className="row wrap">
          <div className="field grow"><label htmlFor="ac-q">Sual sayı</label><input id="ac-q" className="input" type="number" min={5} max={60} value={form.questionCount} onChange={(e) => setForm({ ...form, questionCount: Number(e.target.value) })} /></div>
          <div className="field grow"><label htmlFor="ac-min">Vaxt (dəqiqə)</label><input id="ac-min" className="input" type="number" min={1} max={180} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })} /></div>
        </div>
        {msg && <div className="banner bad" role="alert">{msg}</div>}
        <button className="btn primary" disabled={busy || me?.role !== 'admin' || form.title.trim().length < 3} onClick={create}>Yarışı yarat</button>
        <p className="tiny muted">Suallar mənbə testləri və redaksiyanın sualları qarışığından seçilir; eyni kateqoriyada hamıya eyni suallar düşür. Yarış bitəndə ilk üç yerə sertifikat və təltif avtomatik verilir.</p>
      </section>
      <section className="stack">
        <h2>Yarışlar</h2>
        {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Yarış</th><th>Vaxt</th><th>İştirak</th><th>Qaliblər</th><th /></tr></thead>
              <tbody>
                {(data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.title}</b><br /><span className="tiny muted">{c.category ?? 'Hamısı'} · {c.questionCount} sual · {Math.round(c.timeLimitSec / 60)} dəq · {c.status === 'active' ? 'davam edir' : c.status === 'upcoming' ? 'tezliklə' : 'bitib'}</span></td>
                    <td className="tiny">{formatTime(c.startsAt)}<br />{formatTime(c.endsAt)}</td>
                    <td className="num">{c.participants}</td>
                    <td className="tiny">{c.winners.length ? c.winners.map((w) => (
                      <div key={w.place}><button className="btn ghost small" style={{ paddingInline: 0, minHeight: 28 }} onClick={() => setCert(w.certificateCode)}>{w.place}. {w.name} · {w.pct}%</button></div>
                    )) : '—'}</td>
                    <td>{c.status !== 'finished' && me?.role === 'admin' && <button className="btn secondary small" onClick={async () => { await api.admin.finishCompetition(c.id); toast('Yarış bitirildi, sertifikatlar verildi.'); reload(); }}>İndi bitir</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {cert && <CertificateModal code={cert} admin onClose={() => setCert(null)} />}
    </div>
  );
}
