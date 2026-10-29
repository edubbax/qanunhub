"""Editor-written content merged into the generated bundle: sub-topic sections and formative questions.

content/authored/<topic>.json:
  {
    "sections": [{"from": 1, "title": "Ümumi müddəalar"}, ...],       # optional; lesson order where a section starts
    "questions": [
      {"l": 3, "q": "stem", "o": ["A", "B", "C", "D"], "a": 1, "r": "m. 5.2", "e": "Qanun: «…»"},
      {"l": 4, "q": "stem", "s": ["statement 1", "statement 2", "statement 3"], "o": ["1, 2", "1, 3", "2, 3", "1, 2, 3"], "a": 3, ...}
    ]
  }

Formative questions are the short checks inside a lesson. Questions from the source test files stay in the
"exam" pool and are used in section tests, topic finals and the mock exam.

Usage:
  python3 tools/content/authored.py merge content/build/content.json      # in place, idempotent
  python3 tools/content/authored.py show <topic> <from> <to>              # lesson text for writing questions
  python3 tools/content/authored.py status                                # coverage per topic
"""
import hashlib
import json
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
AUTHORED = os.path.join(ROOT, 'content', 'authored')
BUNDLE = os.path.join(ROOT, 'content', 'build', 'content.json')
SCOPE = {'AC', 'BA', 'BB'}           # categories offered in the app; AB comes later
SOURCE_LABEL = 'QanunHub redaksiyası (formativ sual)'


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def authored_files():
    """Topic -> {'sections', 'questions'}. A topic may be split over '<topic>.json' and '<topic>--<part>.json'."""
    out = {}
    if not os.path.isdir(AUTHORED):
        return out
    for fn in sorted(os.listdir(AUTHORED)):
        if not fn.endswith('.json'):
            continue
        data = load(os.path.join(AUTHORED, fn))
        t = out.setdefault(fn[:-5].split('--')[0], {'questions': []})
        if data.get('sections'):
            t['sections'] = data['sections']
        t['questions'].extend(data.get('questions', []))
    return out


def section_title_from_lesson(title):
    return re.sub(r'\s*\(\d+\)$', '', title)


def merge(bundle, files=None):
    files = authored_files() if files is None else files
    errors, warnings = [], []
    # Idempotent: drop earlier formative questions and sections.
    bundle['items'] = [i for i in bundle['items'] if i.get('pool') != 'formative']
    bundle['units'] = [u for u in bundle['units'] if u.get('pool') != 'formative']
    for u in bundle['units']:
        u['pool'] = 'exam'
    for i in bundle['items']:
        i['pool'] = 'exam'
    lessons_by_topic = defaultdict(list)
    for l in bundle['lessons']:
        lessons_by_topic[l['topicId']].append(l)
    for ls in lessons_by_topic.values():
        ls.sort(key=lambda l: l['order'])

    # ---------------- sections
    bundle['sections'] = []
    for t in sorted(bundle['topics'], key=lambda t: t['order']):
        ls = lessons_by_topic.get(t['id'], [])
        if not ls:
            continue
        spec = files.get(t['id'], {}).get('sections')
        if spec:
            starts = sorted(spec, key=lambda s: s['from'])
            if starts[0]['from'] != 1:
                errors.append(f"{t['id']}: the first section must start at lesson 1")
            groups = []
            for k, s in enumerate(starts):
                end = starts[k + 1]['from'] if k + 1 < len(starts) else 10 ** 6
                groups.append((s['title'], [l for l in ls if s['from'] <= l['order'] < end]))
        else:
            groups = []
            for l in ls:
                title = section_title_from_lesson(l['title'])
                if groups and groups[-1][0] == title:
                    groups[-1][1].append(l)
                else:
                    groups.append((title, [l]))
        for n, (title, members) in enumerate(groups, start=1):
            if not members:
                errors.append(f"{t['id']}: section «{title}» has no lessons")
                continue
            sid = f"{t['id']}-s{n:02d}"
            bundle['sections'].append({'id': sid, 'topicId': t['id'], 'order': n, 'title': title})
            for l in members:
                l['sectionId'] = sid

    # ---------------- formative questions
    lesson_by_ref = {(l['topicId'], l['order']): l for l in bundle['lessons']}
    topic_cats = {t['id']: t['categories'] for t in bundle['topics']}
    per_lesson = defaultdict(int)
    seen_ids = set()
    for tid, data in files.items():
        if tid not in topic_cats:
            errors.append(f'{tid}.json: unknown topic')
            continue
        for k, q in enumerate(data.get('questions', []), start=1):
            where = f'{tid}.json #{k}'
            lesson = lesson_by_ref.get((tid, q.get('l')))
            if not lesson:
                errors.append(f"{where}: no lesson {q.get('l')}")
                continue
            stem, opts, ans = (q.get('q') or '').strip(), [o.strip() for o in q.get('o', [])], q.get('a')
            multi = q.get('t') == 'multi'
            answer = ans if isinstance(ans, list) else [ans]
            if len(stem) < 8:
                errors.append(f'{where}: stem too short')
            if len(opts) < 3 or any(not o for o in opts):
                errors.append(f'{where}: needs at least 3 non-empty options')
            if len({o.casefold() for o in opts}) != len(opts):
                errors.append(f'{where}: duplicate options')
            if not answer or any(not isinstance(a, int) or a < 0 or a >= len(opts) for a in answer):
                errors.append(f'{where}: answer out of range')
            if not multi and len(answer) != 1:
                errors.append(f'{where}: single-choice question needs exactly one answer')
            # Authors write the correct option first; store a stable shuffle (combination labels keep their order).
            h = hashlib.sha1(stem.encode()).digest()
            if not all(re.fullmatch(r'(Yalnız )?[\d, və]+', o) for o in opts) and all(isinstance(a, int) and 0 <= a < len(opts) for a in answer):
                order = sorted(range(len(opts)), key=lambda i: hashlib.sha1(h + bytes([i])).digest())
                opts = [opts[i] for i in order]
                answer = [order.index(a) for a in answer]
            iid = f"{lesson['id']}-f-{hashlib.sha1(stem.encode()).hexdigest()[:8]}"
            if iid in seen_ids:
                errors.append(f'{where}: duplicate question')
                continue
            seen_ids.add(iid)
            cats = [c for c in lesson['categories'] if c in topic_cats[tid]]
            unit = {'id': iid + '-u', 'topicId': tid, 'lessonId': lesson['id'], 'categories': cats, 'importance': 2, 'pool': 'formative'}
            item = {'id': iid, 'unitId': unit['id'], 'topicId': tid, 'lessonId': lesson['id'], 'categories': cats,
                    'type': 'multi' if multi else 'single', 'stem': stem, 'options': opts, 'answer': sorted(answer),
                    'points': 2 if multi else 1, 'source': {'file': SOURCE_LABEL}, 'status': 'published', 'flags': [],
                    'pool': 'formative'}
            if q.get('s'):
                item['statements'] = [s.strip() for s in q['s']]
            if q.get('e'):
                item['explanation'] = q['e'].strip()
            if q.get('r'):
                item['ref'] = q['r'].strip()
            bundle['units'].append(unit)
            bundle['items'].append(item)
            per_lesson[lesson['id']] += 1

    for l in bundle['lessons']:
        if set(l['categories']) & SCOPE and l['topicId'] in files and per_lesson[l['id']] < 2:
            warnings.append(f"{l['id']} «{l['title']}»: {per_lesson[l['id']]} formative question(s)")
    return errors, warnings, per_lesson


def show(topic, a, b, qa=False):
    bundle = load(BUNDLE)
    cards = defaultdict(list)
    for c in bundle['cards']:
        cards[c['lessonId']].append(c)
    for l in sorted(bundle['lessons'], key=lambda l: l['order']):
        if l['topicId'] != topic or not (a <= l['order'] <= b) or not set(l['categories']) & SCOPE:
            continue
        print(f"\n## L{l['order']} {l['title']} [{','.join(l['categories'])}] {', '.join(l['refs'])}")
        for c in sorted(cards[l['id']], key=lambda c: c['order']):
            body = re.sub(r'\n+', ' / ', c['body'])
            if c['kind'] == 'qa':
                if qa:
                    print(f"QA: {c['title']} → {body}")
            else:
                print(f"{c.get('title') or ''}: {body}")


def status():
    bundle = load(BUNDLE)
    files = authored_files()
    errors, warnings, per_lesson = merge(json.loads(json.dumps(bundle)), files)
    for t in sorted(bundle['topics'], key=lambda t: t['order']):
        ls = [l for l in bundle['lessons'] if l['topicId'] == t['id'] and set(l['categories']) & SCOPE]
        if not ls:
            continue
        done = sum(1 for l in ls if per_lesson[l['id']] >= 2)
        total = sum(per_lesson[l['id']] for l in ls)
        print(f"{t['id']:18} lessons {done:3}/{len(ls):3}  questions {total}")
    for e in errors:
        print('ERROR', e)
    print(f'{len(errors)} error(s)')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'merge':
        path = sys.argv[2] if len(sys.argv) > 2 else BUNDLE
        b = load(path)
        errs, warns, _ = merge(b)
        for e in errs:
            print('ERROR', e)
        if errs:
            sys.exit(1)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(b, f, ensure_ascii=False, separators=(',', ':'))
        n = sum(1 for i in b['items'] if i.get('pool') == 'formative')
        print(f"merged: {len(b['sections'])} sections, {n} formative questions, {len(warns)} lesson(s) with fewer than 2")
    elif cmd == 'show':
        show(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), '--qa' in sys.argv)
    elif cmd == 'status':
        status()
    else:
        print(__doc__)
