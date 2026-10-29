"""Builds content/build/content.json (ContentBundle) from the course PDFs' text.

Usage: python3 -I tools/content/build.py SOURCES_DIR OUT_JSON
SOURCES_DIR contains files.tsv (id, size, title) and pdf/<id>.pdf. Text is extracted on the fly in two
modes (reading order, and column-aware layout); each file uses whichever parses better.
"""
import hashlib
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_law import parse_articles, parse_karguzarliq  # noqa: E402
from parse_qa import parse_qa  # noqa: E402
from parse_tests import parse_test  # noqa: E402
from pdftext import pdf_to_text  # noqa: E402
from program import (DRAFT_FILES, KEY_OVERRIDES, OUTDATED_TERMS, QA_TEXT_FIXES, TOPICS,  # noqa: E402
                     article_categories, classify_file)
from textutil import build_vocab, cut_promo_tail, fix_split_words, fold, strip_branding  # noqa: E402

LESSON_CHARS = 2200
LESSON_MAX_ARTS = 5
CARD_CHARS = 900
MAP_MIN = 0.10
POOL_MIN = 0.05

STOP = set('''ve ile ucun olan olunur edilir bu hemin asagidaki hansi hansidir hansilardir neyi nedir kim kimdir
ar azerbaycan respublikasinin respublikasi qanun qanunu qanununa haqqinda uzre gore esasen olaraq olmaq olmalidir
bir iki uc her hec ya yaxud ve ya da de ki ise ancaq yalniz habele hemcinin bele diger sonra evvel qeder kimi
edilmesi edilmisdir muvafiq mueyyen tereflerin terefinden duzgun dogru dogrudur yanlis aid deyil'''.split())

SUB_LAW = {'bayraq': 'Bayraq', 'gerb': 'Gerb', 'himn': 'Himn'}


def tokens(text):
    out = []
    for w in fold(text).split():
        if len(w) < 3 or w in STOP or w.isdigit():
            continue
        out.append(w[:6])
    return out


class Tfidf:
    def __init__(self, docs):
        self.df = Counter()
        self.vecs = []
        for d in docs:
            tf = Counter(tokens(d))
            self.vecs.append(tf)
            self.df.update(tf.keys())
        self.n = max(1, len(docs))
        self.vecs = [self._weigh(v) for v in self.vecs]

    def _weigh(self, tf):
        v = {t: (1 + math.log(c)) * math.log(1 + self.n / (1 + self.df.get(t, 0))) for t, c in tf.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1
        return {t: x / norm for t, x in v.items()}

    def query(self, text):
        q = self._weigh(Counter(tokens(text)))
        return [sum(q.get(t, 0) * w for t, w in d.items()) for d in self.vecs]


def shingles(text, k=3):
    w = fold(text).split()
    return {' '.join(w[i:i + k]) for i in range(max(1, len(w) - k + 1))}


def jacc(a, b):
    return len(a & b) / max(1, min(len(a), len(b)))


def short_id(s, n=6):
    return hashlib.sha1(s.encode()).hexdigest()[:n]


LABELS = [('Qliz tipli', 'Qəliz tipli test'), ('Sad tipli', 'Sadə tipli test'), ('400 Test', '400 test'), ('500 Test', '500 test'),
          ('Qarq', 'Qarışıq test'), ('Test 1', 'Test 1'), ('Test 2', 'Test 2'), ('Test - 1', 'Test 1'), ('cavab 2', 'Test 2'), ('Test', 'Test və cavablar')]


def source_label(title, topic_short):
    for k, v in LABELS:
        if k in title:
            sub = next((SUB_LAW[s] for s in SUB_LAW if title.lower().startswith(s)), None)
            return f"{topic_short}{' (' + sub + ')' if sub else ''} · {v}"
    return topic_short


def split_body(body, limit=CARD_CHARS):
    parts, cur = [], ''
    for para in re.split(r'(?<=[.;:])\s+(?=[A-ZƏÖÜÇŞĞİ0-9])|\n', body):
        if len(cur) + len(para) + 1 > limit and cur:
            parts.append(cur.strip())
            cur = ''
        cur += (' ' if cur else '') + para
    if cur.strip():
        parts.append(cur.strip())
    return parts or [body]


def outdated(text):
    return [why for pat, why in OUTDATED_TERMS if re.search(pat, text)]


def main(src, out_path):
    titles = {}
    for line in open(os.path.join(src, 'files.tsv')):
        fid, size, title = line.rstrip('\n').split('\t')
        if os.path.exists(os.path.join(src, 'pdf', fid + '.pdf')):
            titles[fid] = title

    raw = {}
    for fid in titles:
        p = os.path.join(src, 'pdf', fid + '.pdf')
        raw[fid] = {'flow': pdf_to_text(p, columns=False), 'cols': pdf_to_text(p, columns=True)}
    vocab = build_vocab(v['flow'] for v in raw.values())

    def clean(t):
        return fix_split_words(cut_promo_tail(strip_branding(t)), vocab)

    topic_meta = {t[0]: t for t in TOPICS}
    laws = defaultdict(list)       # topic -> [(sub, articles)]
    tests = []                     # (fid, topic, cats, questions)
    qas = defaultdict(list)        # topic -> [{'q','a','file'}]
    report = []

    for fid, title in sorted(titles.items(), key=lambda x: x[1]):
        topic, kind, sub, cats = classify_file(title)
        if not topic or not kind:
            report.append((title, 'skipped', ''))
            continue
        if kind == 'law':
            text = clean(raw[fid]['flow'])
            if topic == 'karguzarliq':
                arts = parse_karguzarliq(text)
            else:
                arts, _ = parse_articles(text)
            if topic == 'inzibati-icraat' and sub == 'ba':
                report.append((title, 'law (BA version, used as fallback)', f'{len(arts)} maddə'))
                laws[topic + ':ba'].append((sub, arts))
                continue
            laws[topic].append((sub, arts))
            report.append((title, 'law', f'{len(arts)} maddə'))
        elif kind == 'test':
            best = None
            for mode in ('flow', 'cols'):
                qs, _ = parse_test(clean(raw[fid][mode]))
                score = sum(1 for q in qs if q['answer'] is not None) + 0.3 * len(qs)
                if best is None or score > best[0]:
                    best = (score, qs, mode)
            tests.append((fid, topic, cats, best[1]))
            answered = sum(1 for q in best[1] if q['answer'] is not None)
            report.append((title, f'test ({best[2]})', f'{len(best[1])} sual, {answered} açarlı'))
        elif kind == 'qa':
            best = max((parse_qa(clean(raw[fid][m])) for m in ('flow', 'cols')), key=len)
            for p in best:
                for a, b in QA_TEXT_FIXES:
                    p['a'] = p['a'].replace(a, b)
                p['file'] = title
                p['sub'] = sub
            qas[topic].extend(best)
            report.append((title, 'sual-cavab', f'{len(best)} cüt'))
        else:
            report.append((title, kind + ' (istifadə olunmur)', ''))

    bundle = {'version': date.today().isoformat(), 'generatedAt': date.today().isoformat(),
              'topics': [], 'lessons': [], 'cards': [], 'units': [], 'items': []}
    stats = {}

    for order, (tid, pno, ttitle, tshort, tcats, free, law_title, note) in enumerate(TOPICS, start=1):
        bundle['topics'].append({'id': tid, 'programNo': pno, 'title': ttitle, 'shortTitle': tshort, 'order': order,
                                 'categories': tcats, 'free': free, 'lawTitle': law_title, **({'note': note} if note else {})})
        # ---------------- lessons from articles
        arts = []
        for sub, alist in laws.get(tid, []):
            for a in alist:
                cats = ALLC if tid == 'remzler' else article_categories(tid, a['ref'].replace('bənd ', '').replace('hissə ', ''))
                if tid == 'karguzarliq':
                    cats = tcats
                if not cats:
                    continue
                arts.append({**a, 'sub': sub, 'cats': [c for c in cats if c in tcats]})
        lessons = []
        cur = None
        for a in arts:
            key = (a['sub'], a['chapter'], tuple(a['cats']))
            size = len(a['body'])
            if cur is None or cur['key'] != key or cur['size'] + size > LESSON_CHARS or len(cur['arts']) >= LESSON_MAX_ARTS:
                cur = {'key': key, 'arts': [], 'size': 0}
                lessons.append(cur)
            cur['arts'].append(a)
            cur['size'] += size
        lesson_rows = []
        for i, l in enumerate(lessons, start=1):
            lid = f'{tid}-{i:03d}'
            sub = l['key'][0]
            prefix = f'{SUB_LAW[sub]}: ' if sub in SUB_LAW else ''
            names = [a['title'] for a in l['arts'] if a['title']]
            chapter = l['arts'][0]['chapter']
            same_chapter = [x for x in lessons if x['arts'][0]['chapter'] == chapter and chapter]
            if tid == 'karguzarliq':
                title = l['arts'][0]['title'] + (f' ({same_chapter.index(l) + 1})' if len(same_chapter) > 1 else '')
            elif chapter and len(chapter) <= 70:
                title = prefix + chapter + (f' ({same_chapter.index(l) + 1})' if len(same_chapter) > 1 else '')
            else:
                title = prefix + (names[0] if names else tshort) + (' və s.' if len(names) > 1 else '')
            if len(title) > 90:
                title = title[:87].rsplit(' ', 1)[0] + '…'
            refs = [('' if a['ref'].startswith(('bənd', 'hissə')) else 'm. ') + a['ref'] for a in l['arts']]
            if sub in SUB_LAW:
                refs = [f'{SUB_LAW[sub]} {r}' for r in refs]
            text = ' '.join(a['title'] + ' ' + a['body'] for a in l['arts'])
            row = {'id': lid, 'topicId': tid, 'order': i, 'title': title, 'refs': refs, 'categories': list(l['key'][2]),
                   'estMinutes': max(3, min(10, round(l['size'] / 450) + 2))}
            bundle['lessons'].append(row)
            lesson_rows.append((row, text, l['arts']))
            order_c = 0
            for a in l['arts']:
                parts = split_body(a['body'])
                ref = ('' if a['ref'].startswith(('bənd', 'hissə')) else 'Maddə ') + a['ref']
                for k, part in enumerate(parts):
                    order_c += 1
                    head = f"{ref}. {a['title']}" if a['title'] else ref
                    bundle['cards'].append({'id': f'{lid}-c{order_c}', 'lessonId': lid, 'order': order_c, 'kind': 'law',
                                            'title': head + (' (davamı)' if k else ''), 'body': part, 'ref': refs[0] if len(refs) == 1 else ref})
                for n in a['notes']:
                    order_c += 1
                    bundle['cards'].append({'id': f'{lid}-c{order_c}', 'lessonId': lid, 'order': order_c, 'kind': 'note',
                                            'title': 'Yadda saxla', 'body': n})
        lesson_index = Tfidf([t for _, t, _ in lesson_rows]) if lesson_rows else None

        # ---------------- Q&A cards: up to 3 best pairs per lesson
        if lesson_index and qas.get(tid):
            per_lesson = defaultdict(list)
            for p in qas[tid]:
                if outdated(p['q'] + ' ' + p['a']):
                    continue
                sims = lesson_index.query(p['q'] + ' ' + p['a'])
                j = max(range(len(sims)), key=lambda k: sims[k])
                if sims[j] >= MAP_MIN:
                    per_lesson[j].append((sims[j], p))
            for j, plist in per_lesson.items():
                row = lesson_rows[j][0]
                base = sum(1 for c in bundle['cards'] if c['lessonId'] == row['id'])
                for k, (_, p) in enumerate(sorted(plist, key=lambda x: -x[0])[:3], start=1):
                    bundle['cards'].append({'id': f"{row['id']}-q{k}", 'lessonId': row['id'], 'order': base + k, 'kind': 'qa',
                                            'title': p['q'], 'body': p['a']})

        # ---------------- items from tests
        items = []
        for fid, ttopic, fcats, qs in tests:
            if ttopic != tid:
                continue
            title = titles[fid]
            draft_reason = next((v for k, v in DRAFT_FILES.items() if title.startswith(k)), None)
            for q in qs:
                if q['type'] == 'unknown':
                    continue
                flags = []
                answer = q['answer']
                ov = next((v for (pfx, no), v in KEY_OVERRIDES.items() if title.startswith(pfx) and no == q['no']), None)
                explanation = None
                if ov and q['type'] == 'single':
                    answer = ['ABCD'.index(ov['answer'])]
                    flags.append('key_corrected')
                    explanation = ov['note']
                if draft_reason or answer is None:
                    flags.append('no_key')
                opts = q['options']
                if q['type'] == 'single' and len(opts) < 3:
                    flags.append('options')
                if len({fold(o) for o in opts}) < len(opts):
                    flags.append('dup_options')
                if not 8 <= len(q['stem']) <= 900:
                    flags.append('stem_length')
                full = q['stem'] + ' ' + ' '.join(opts) + ' ' + ' '.join(q['statements'] or [])
                if outdated(full):
                    flags.append('outdated')
                if re.search(r'\|| [Ğ] |Bizi Sosial|shamkhal', full):
                    flags.append('garbled')
                items.append({'q': q, 'title': title, 'fid': fid, 'fcats': fcats, 'answer': answer, 'flags': flags,
                              'explanation': explanation, 'text': full,
                              'key_text': ' '.join(opts[a] for a in (answer or []) if a < len(opts))})

        # map items to lessons
        for it in items:
            it['lesson'] = None
            it['sim'] = 0
            if lesson_index:
                ref_m = re.search(r'(\d{1,3}(?:-\d)?)[-‐]?(?:ci|cı|cu|cü|ü|u|i|ı)?\s+maddə|maddə\s+(\d{1,3}(?:-\d)?)', fold(it['q']['stem']).replace('madde', 'maddə'))
                sims = lesson_index.query(it['text'] + ' ' + it['key_text'])
                j = max(range(len(sims)), key=lambda k: sims[k])
                it['sim'] = sims[j]
                if ref_m:
                    ref = 'm. ' + (ref_m.group(1) or ref_m.group(2))
                    hit = next((k for k, (row, _, _) in enumerate(lesson_rows) if ref in row['refs']), None)
                    if hit is not None:
                        j, it['sim'] = hit, max(sims[j], MAP_MIN)
                if it['sim'] >= MAP_MIN:
                    it['lesson'] = j
            restricted = tid in ('ombudsman', 'mehkemeler', 'mulki', 'emek', 'nha', 'inzibati-icraat')
            if it['lesson'] is None and restricted and it['sim'] < POOL_MIN:
                it['flags'].append('scope')

        # units: near-duplicate questions with the same correct answer are variants of one unit
        units = []
        for it in items:
            sh = shingles(it['q']['stem'] + ' ' + ' '.join(it['q']['statements'] or []))
            kt = fold(it['key_text'])
            hit = None
            for u in units:
                if jacc(sh, u['sh']) >= 0.75 and fold(u['key_text']) == kt and kt:
                    hit = u
                    break
                if jacc(sh, u['sh']) >= 0.9 and kt and fold(u['key_text']) != kt and kt in {fold(o) for o in u['items'][0]['q']['options']}:
                    it['flags'].append('key_conflict')
                    for o in u['items']:
                        if 'key_conflict' not in o['flags']:
                            o['flags'].append('key_conflict')
            if hit:
                hit['items'].append(it)
            else:
                units.append({'sh': sh, 'key_text': it['key_text'], 'items': [it]})

        n_pub = 0
        for k, u in enumerate(units, start=1):
            uid = f'{tid}-u{k:04d}'
            first = next((i for i in u['items'] if i['lesson'] is not None), u['items'][0])
            if first['lesson'] is not None:
                lrow = lesson_rows[first['lesson']][0]
                lesson_id, ucats = lrow['id'], lrow['categories']
            else:
                lesson_id, ucats = None, [c for c in first['fcats'] if c in tcats]
            bundle['units'].append({'id': uid, 'topicId': tid, 'lessonId': lesson_id, 'categories': ucats, 'importance': 2})
            for it in u['items']:
                q = it['q']
                blocking = {'no_key', 'options', 'dup_options', 'stem_length', 'outdated', 'garbled', 'key_conflict', 'scope'}
                status = 'draft' if blocking & set(it['flags']) else 'published'
                if status == 'published':
                    n_pub += 1
                expl = it['explanation']
                ref = None
                if lesson_id:
                    _, _, larts = lesson_rows[first['lesson']]
                    expl2, ref = best_quote(larts, q['stem'] + ' ' + it['key_text'])
                    expl = expl or expl2
                label = source_label(it['title'], tshort)
                bundle['items'].append({
                    'id': f"{tid}-{short_id(it['title'])}-{q['no']}" + (f"-s{q.get('section')}" if q.get('section') else ''),
                    'unitId': uid, 'topicId': tid, 'lessonId': lesson_id, 'categories': ucats,
                    'type': q['type'], 'stem': q['stem'], **({'statements': q['statements']} if q['statements'] else {}),
                    'options': q['options'], 'answer': it['answer'] or [], 'points': 2 if q['type'] == 'multi' else 1,
                    **({'explanation': expl} if expl else {}), **({'ref': ref} if ref else {}),
                    'source': {'file': label, 'no': q['no']}, 'status': status, 'flags': it['flags'],
                })
        stats[tid] = {'lessons': len(lesson_rows), 'units': len(units), 'items': len(items), 'published': n_pub}

    # ids must be unique
    seen = Counter(i['id'] for i in bundle['items'])
    for i in bundle['items']:
        if seen[i['id']] > 1:
            i['id'] += '-' + short_id(i['stem'], 4)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(bundle, f, ensure_ascii=False, separators=(',', ':'))
    write_report(os.path.join(os.path.dirname(out_path), 'report.md'), report, stats, bundle)
    print(json.dumps(stats, ensure_ascii=False, indent=1))


ALLC = ['AB', 'AC', 'BA', 'BB']


def best_quote(arts, text):
    """The sentence of the lesson's law text closest to the question, as a legal basis."""
    sents = []
    for a in arts:
        for s in re.split(r'(?<=[.;])\s+|\n', a['body']):
            if 25 <= len(s) <= 420:
                sents.append((s, a['ref']))
    if not sents:
        return None, None
    idx = Tfidf([s for s, _ in sents])
    sims = idx.query(text)
    j = max(range(len(sims)), key=lambda k: sims[k])
    if sims[j] < 0.2:
        return None, None
    ref = sents[j][1]
    ref = ref if ref.startswith(('bənd', 'hissə')) else 'Maddə ' + ref
    return f'Qanun: «{sents[j][0].strip()}»', ref


def write_report(path, report, stats, bundle):
    flags = Counter(f for i in bundle['items'] for f in i['flags'])
    with open(path, 'w') as f:
        f.write(f"# Məzmun hesabatı ({bundle['version']})\n\n")
        f.write('| Mövzu | Dərs | Vahid | Sual | Dərc olunub |\n|---|---:|---:|---:|---:|\n')
        for tid, s in stats.items():
            f.write(f"| {tid} | {s['lessons']} | {s['units']} | {s['items']} | {s['published']} |\n")
        f.write('\n## Bayraqlar\n\n')
        for k, v in flags.most_common():
            f.write(f'- `{k}`: {v}\n')
        f.write('\n## Fayllar\n\n| Fayl | Növ | Nəticə |\n|---|---|---|\n')
        for t, k, r in report:
            f.write(f'| {t} | {k} | {r} |\n')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
