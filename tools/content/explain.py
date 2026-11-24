"""Answer-key audit and explanations from the law text.

For every published question each option is matched against the sentences of the law cards of its topic. The
sentence that best supports the key (shared word stems with the key and the question) becomes the explanation,
quoted with its article, when the current explanation is missing, does not mention the key, or carries a study
code. Questions where a distractor is supported much better than the key are listed for manual review.

    python3 explain.py content.json            # report only
    python3 explain.py content.json --write    # also rewrite weak explanations in place
"""
import json
import os
import re
import sys
from collections import defaultdict


WORD = re.compile(r'[A-Za-zƏəÖöÜüĞğÇçŞşİıI0-9]+')
STOP = set('və ilə üçün olan olunur edilir edilə bu həmin aşağıdakı hansı hansıdır hansılardır kim kimdir nədir nə '
           'ar azərbaycan respublikasının respublikası respublikasında qanun qanunu qanuna qanunun haqqında üzrə görə '
           'əsasən olaraq bir hər heç ya yaxud da də ki isə yalnız habelə digər kimi edilməsi müvafiq müəyyən tərəfindən '
           'düzgün doğru deyil aid olur olunan seçin göstərin uyğun olan maddəsinə maddəsində konstitusiyasına '
           'konstitusiyaya cavab variant variantı biri neçə'.split())
NEG = re.compile(r'\b(deyil|yoxdur|olmayan|yanlış|səhv|istisna|olmaz|bilməz|aid edilmir|daxil edilmir|daxil deyil)\b', re.I)
CODE = re.compile(r'\s*\((?:Kod|Код)\s*:[^)]*\)')


def stems(t: str) -> set:
    return {w.lower()[:6] for w in WORD.findall(t) if w.lower() not in STOP and len(w) > 2}


def key_text(item: dict, idx: int) -> str:
    o = item['options'][idx] if idx < len(item['options']) else ''
    st = item.get('statements') or []
    if st:
        nums = [int(x) for x in re.findall(r'\d+', o)]
        if nums and all(0 < n <= len(st) for n in nums):
            return ' '.join(st[n - 1] for n in nums)
    return o


SPLIT = re.compile(r'(?<=[.;:])\s+(?=(?:\d+(?:\.\d+)*\.?|[IVX]+\.|\d+\))\s|[A-ZƏÖÜÇŞĞİ])')
NUM = re.compile(r'^(\d+(?:[.-]\d+)*\.?|[IVX]+\.|\d+\))\s+')


def law_sentences(title: str, body: str):
    """(sentence, ref) pairs of a law card. The ref names the part ('Maddə 3.II', 'Maddə 25.8'); list points are
    joined to the sentence that introduces them, so «Aşağıdakı məsələlər … : 2) amnistiya» reads as one claim."""
    art = (title or '').split('.')[0].strip()
    part, lead, pending, leads = '', None, '', {}
    for raw in SPLIT.split(body):
        raw = raw.strip()
        if re.fullmatch(r'\d+(?:[.-]\d+)*\.?|[IVX]+\.|\d+\)', raw):
            pending = raw  # the number got split off from its text
            continue
        if pending:
            raw, pending = f'{pending} {raw}', ''
        m = NUM.match(raw)
        num = m.group(1) if m else ''
        text = NUM.sub('', raw)
        text = re.sub(r'\s+(?:\d+(?:[.-]\d+)*\.?|[IVX]+\.)$', '', text).strip()
        if not text:
            continue
        sub = None
        if re.fullmatch(r'[IVX]+\.', num):
            part, lead = num[:-1], None
        elif re.fullmatch(r'\d+(?:[.-]\d+)+\.?', num):
            part, lead = num.rstrip('.'), None
            sub = leads.get(part.rsplit('.', 1)[0])  # «25.2. … tənbehlər:» → «25.2.1. töhmət»
        point = num.endswith(')')
        if lead and point:
            claim = f'{lead} … {text}'
        elif sub:
            claim = f'{sub} … {text}'
        else:
            claim = text
            if not point:
                lead = text if text.endswith(':') else None
        if text.endswith(':') and part:
            leads[part] = text
        if text.endswith(':') and not point:
            continue  # a bare lead says nothing on its own
        ref = art
        if part and art.startswith('Maddə'):
            ref = f'Maddə {part}' if '.' in part else f'{art}.{part}'
        yield CODE.sub('', claim).strip().rstrip(';'), ref


def build_index(bundle: dict):
    lesson_topic = {l['id']: l['topicId'] for l in bundle['lessons']}
    idx = defaultdict(list)
    for c in bundle['cards']:
        if c['kind'] != 'law':
            continue
        title = c.get('title') or ''
        m = re.match(r'^(Maddə [\d\-]+)\.\s*(.+?)(?:\s*\(davamı\))?$', title)
        if m:
            name = re.sub(r'\s*\([^)]*\)$', '', m.group(2))
            idx.setdefault(('titles', lesson_topic[c['lessonId']]), {})[re.sub(r'\W+', ' ', name).strip().lower()] = m.group(1)
        for s, ref in law_sentences(title, c['body']):
            if 25 <= len(s) <= 600:
                idx[lesson_topic[c['lessonId']]].append((s, stems(s), ref or c.get('ref') or ''))
    return idx


def support(opt: set, q: set, sent: set) -> float:
    if not opt:
        return 0.0
    # A short option ("qanunla", "Prezident") is found in many sentences; then the question must decide.
    w = 0.35 if len(opt) >= 3 else 1.0
    return len(opt & sent) / len(opt) + w * (len(q & sent) / len(q) if q else 0)


def analyse(item: dict, idx) -> dict:
    sents = idx.get(item['topicId'], [])
    q = stems(item['stem'])
    opts = [stems(key_text(item, k)) - q for k in range(len(item['options']))]
    best = []
    for k, o in enumerate(opts):
        sc, top = 0.0, None
        for s, ss, ref in sents:
            v = support(o, q, ss)
            if v > sc:
                sc, top = v, (s, ref)
        best.append((sc, top))
    keys = [a for a in item['answer'] if a < len(opts)]
    ksc = max((best[a][0] for a in keys), default=0)
    dsc = max((best[k][0] for k in range(len(opts)) if k not in keys), default=0)
    return {'best': best, 'key': ksc, 'distractor': dsc, 'negative': bool(NEG.search(item['stem']))}


def weak_explanation(item: dict) -> bool:
    e = item.get('explanation') or ''
    if not e.strip() or 'Kod:' in e:
        return True
    kt = stems(' '.join(key_text(item, a) for a in item['answer'])) - stems(item['stem'])
    return bool(kt) and len(kt & stems(e)) / len(kt) < 0.34


def quote(top) -> str:
    s, ref = top
    return f'{ref}: «{s}»' if ref else f'Qanun: «{s}»'


def generated(e: str) -> bool:
    """Explanations written by this tool or by the earlier pipeline (a bare quote), as opposed to an author's text."""
    return not e.strip() or e.startswith('Qanun: «') or bool(re.match(r'^Maddə [\d.\-IVX]+: «.*»$', e, re.S))


def candidate(item: dict, a: dict, idx):
    sents = idx.get(item['topicId'], [])
    keys = [k for k in item['answer'] if k < len(item['options'])]
    st = item.get('statements') or []
    if st:
        # Quote the law for the statements (right and wrong alike), so the learner sees where each one comes from.
        q = stems(item['stem'])
        picks = []
        for t in st:
            ts = stems(t) - q
            sc, top = max(((support(ts, q, ss), (s, ref)) for s, ss, ref in sents), default=(0, None), key=lambda x: x[0])
            cover = len(ts & stems(top[0])) / len(ts) if top and ts else 0
            if top and sc >= 0.95 and cover >= 0.7 and top not in [p for _, p in picks]:
                picks.append((sc, top))
        picks = sorted(picks, key=lambda x: -x[0])[:3]
        if not picks:
            return 0, None
        ans = ', '.join(item['options'][k] for k in keys)
        return min(p[0] for p in picks), f'Cavab: {ans}. ' + ' '.join(quote(p) for _, p in picks)
    titled = article_of(item, keys, idx)
    if titled:
        return 2.0, titled
    if a['negative']:
        # For "which is NOT" questions quote the sentence that lists the right ones: it matches the question and
        # one of the other options.
        q = stems(item['stem'])
        others = [stems(key_text(item, k)) - q for k in range(len(item['options'])) if k not in keys]
        others = [o for o in others if o]

        def neg(ss):
            qc = len(q & ss) / (len(q) or 1)
            oc = max((len(o & ss) / len(o) for o in others), default=0)
            return qc + 0.5 * oc, qc
        best = max(((neg(ss), (s, ref)) for s, ss, ref in sents), default=((0, 0), None), key=lambda x: x[0][0])
        (sc, qc), top = best
        return (sc, quote(top)) if top and qc >= 0.6 else (0, None)
    sc, top = max((a['best'][k] for k in keys), key=lambda x: x[0], default=(0, None))
    return (sc, quote(top)) if top and sc >= 0.75 else (0, None)


def article_of(item: dict, keys: list, idx):
    """Questions whose answer is an article's title ("Bu müddəa hansı maddəyə aiddir?"): name the article and quote
    the sentence of it closest to the question."""
    if len(keys) != 1:
        return None
    key = re.sub(r'\W+', ' ', item['options'][keys[0]]).strip().lower()
    titles = idx.get(('titles', item['topicId']), {})
    art = titles.get(key)
    if not art:
        return None
    q = stems(item['stem'])
    best = max(((len(q & ss), s, ref) for s, ss, ref in idx.get(item['topicId'], []) if ref.split('.')[0] == art),
               default=(0, None, None), key=lambda x: x[0])
    name = item['options'][keys[0]].strip().rstrip('.')
    if best[1] and best[0] >= 2:
        return f'{art} — «{name}». {best[2]}: «{best[1]}»'
    return f'{art} — «{name}».'


def norm(t: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[^\wƏəÖöÜüĞğÇçŞşİı ]+', ' ', t.lower())).strip()


def relabel(item: dict, idx) -> bool:
    """«Qanun: «…»» → «Maddə 3.III: «…»» when the quoted text is found in the topic's law cards."""
    e = item.get('explanation') or ''
    m = re.fullmatch(r'Qanun: «(.+)»\.?', e.strip(), re.S)
    if not m:
        return False
    body = re.sub(r'^\d+\)\s*', '', m.group(1).strip())
    pieces = [norm(x) for x in body.split('…') if len(norm(x)) >= 12]
    if not pieces:
        return False
    for s, _, ref in idx.get(item['topicId'], []):
        n = norm(s)
        if ref.startswith('Maddə') and all(p in n for p in pieces):
            item['explanation'] = f'{ref}: «{body}»'
            if not item.get('ref'):
                item['ref'] = ref
            return True
    return False


def apply_overrides(bundle: dict, path: str) -> int:
    if not os.path.exists(path):
        return 0
    over = json.load(open(path, encoding='utf-8'))
    n = 0
    for item in bundle['items']:
        o = over.get(item['id'])
        if isinstance(o, dict):
            item['explanation'] = o['explanation']
            if o.get('ref'):
                item['ref'] = o['ref']
            n += 1
    return n


def run(bundle: dict, write: bool = False):
    idx = build_index(bundle)
    rewritten, suspects, unsupported = 0, [], 0
    for item in bundle['items']:
        if item['status'] != 'published' or item.get('pool') == 'drill':
            continue
        a = analyse(item, idx)
        if not a['negative'] and a['distractor'] >= a['key'] + 0.25 and a['distractor'] >= 0.9:
            suspects.append((item['id'], round(a['key'], 2), round(a['distractor'], 2)))
        if not write:
            continue
        e = item.get('explanation') or ''
        weak = weak_explanation(item)
        if not weak and not generated(e):
            continue
        sc, text = candidate(item, a, idx)
        if text and e.strip() and 'Kod:' not in e:
            # Keep the current text unless the new quote supports the key clearly better.
            keys = [k for k in item['answer'] if k < len(item['options'])]
            q = stems(item['stem'])
            ks = stems(' '.join(key_text(item, k) for k in keys)) - q
            old, new = support(ks, q, stems(e)), support(ks, q, stems(text))
            qo, qn = len(q & stems(e)) / (len(q) or 1), len(q & stems(text)) / (len(q) or 1)
            if new < old + 0.15 or qn < qo or (a['negative'] and not weak):
                text = None
        if text and not (item.get('statements') or ' — «' in text):
            q = stems(item['stem'])
            if len(q & stems(text)) / (len(q) or 1) < (0.4 if e.strip() else 0.5):
                text = None  # the quote shares too little with the question to explain it
        if text and (weak or text != e):
            item['explanation'] = text
            m = re.match(r'^(Maddə [^:]+):', text)
            if m and (not item.get('ref') or generated(e)):
                item['ref'] = m.group(1).split(',')[0]
            rewritten += 1
        elif CODE.search(e):
            item['explanation'] = CODE.sub('', e)
            rewritten += 1
        elif weak:
            unsupported += 1
        if relabel(item, idx):
            rewritten += 1
    return {'rewritten': rewritten, 'unsupported': unsupported, 'suspects': suspects}


if __name__ == '__main__':
    path = sys.argv[1]
    bundle = json.load(open(path, encoding='utf-8'))
    res = run(bundle, write='--write' in sys.argv)
    if '--write' in sys.argv:
        res['overrides'] = apply_overrides(bundle, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'content', 'fixes', 'explanations.json'))
    print({k: (len(v) if isinstance(v, list) else v) for k, v in res.items()})
    if '--write' in sys.argv:
        json.dump(bundle, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    if '--suspects' in sys.argv:
        json.dump(res['suspects'], open(sys.argv[sys.argv.index('--suspects') + 1], 'w'), ensure_ascii=False)
