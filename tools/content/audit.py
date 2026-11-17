"""Answer-key audit against the law text, for every published source question of a topic (or all topics).

    python3 tools/content/audit.py [topic ...] [--show]

For each question the law sentences closest to the stem are found; every option is scored by how much of it those
sentences contain (word stems, and numbers exactly). A question passes when the key is clearly the best supported
option (or, for "which is NOT ..." questions, clearly the least supported one). Everything else is listed for a
person to read against the law; decisions go to content/fixes/items.json, confirmed keys to content/fixes/verified.json.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
BUNDLE = os.path.join(ROOT, 'content', 'build', 'content.json')
VERIFIED = os.path.join(ROOT, 'content', 'fixes', 'verified.json')

WORD = re.compile(r"[A-Za-zƏəÖöÜüĞğÇçŞşİıI0-9]+")
STOP = set('və ilə üçün olan olunur edilir bu həmin aşağıdakı hansı hansıdır kim nədir ar azərbaycan respublikasının '
           'respublikası respublikasında qanun qanunu qanunun haqqında üzrə görə əsasən olaraq bir hər heç ya yaxud da də ki isə '
           'habelə digər kimi edilməsi müvafiq müəyyən tərəfindən düzgün doğru deyil aid hansılardır göstərilib '
           'nəzərdə tutulub tutulmuşdur edilmişdir olunmuşdur variant cavab fikir'.split())
NEG = re.compile(r'\bdeyil|yanlış|səhv|olmayan|aid olm|aid edilmir|istisna|olunmur|edilmir|tapmır|bilməz|'
                 r'göstərilməmiş|nəzərdə tutulmay|əhatə etmir|daxil deyil|nəzərə alınmır|şamil olunmur|şamil edilmir|'
                 r'tələb olunmur|qadağan deyil|aid deyil', re.I)
NUMWORDS = {'bir': '1', 'iki': '2', 'üç': '3', 'dörd': '4', 'beş': '5', 'altı': '6', 'yeddi': '7', 'səkkiz': '8',
            'doqquz': '9', 'on': '10', 'on beş': '15', 'iyirmi': '20', 'otuz': '30', 'qırx': '40', 'əlli': '50',
            'altmış': '60', 'yetmiş': '70', 'səksən': '80', 'doxsan': '90', 'yüz': '100'}


def norm_nums(t: str) -> str:
    t = t.lower()
    for w in sorted(NUMWORDS, key=len, reverse=True):
        t = re.sub(rf'\b{w}\b', NUMWORDS[w], t)
    return t


def stems(t: str) -> set:
    out = set()
    for w in WORD.findall(norm_nums(t)):
        if w in STOP or (len(w) < 3 and not w.isdigit()):
            continue
        out.add(w if w.isdigit() else w[:6])
    return out


def nums(t: str) -> set:
    return set(re.findall(r'\d+', norm_nums(t)))


def law_sentences(b, topic):
    les = {l['id']: l for l in b['lessons']}
    out = []
    for c in b['cards']:
        if c['kind'] != 'law' or les[c['lessonId']]['topicId'] != topic:
            continue
        art = re.match(r'Maddə [\d-]+', c['title'] or '')
        parts = re.split(r'(?<=[.;:])\s+(?=[A-ZƏÖÜĞÇŞİ0-9])', c['body'])
        for k, s in enumerate(parts):
            if len(s) < 20:
                continue
            # A sentence plus its neighbour, so lists ("aşağıdakılardır: ... ;") stay with their heading.
            ctx = s + ' ' + (parts[k + 1] if k + 1 < len(parts) else '')
            out.append(((art.group(0) if art else '') + ' ' + s, stems(ctx), nums(ctx)))
    return out


SHOW = {'conflict', 'multi'}
ALL_ABOVE = re.compile(r'(bütün|hamısı|hər (iki|üç)).{0,25}(yuxarıdakı|sadalanan|variant|doğrudur)|yuxarıdakıların hamısı|hamısı doğrudur|^hamısı\\.?$|^bütün variantlar', re.I)


def law_text(b, topic):
    les = {l['id']: l for l in b['lessons']}
    return norm_nums(' '.join(c['body'] for c in b['cards'] if c['kind'] == 'law' and les[c['lessonId']]['topicId'] == topic))


def numeric_judge(it, text):
    """Questions whose options are numbers: the key's number must sit in the passage that best matches the stem."""
    opts = it['options']
    on = [re.findall(r'\d+', norm_nums(o)) for o in opts]
    if not all(len(x) == 1 for x in on) or any(len(o) > 45 for o in opts) or len(set(x[0] for x in on)) < len(opts):
        return None
    q = stems(it['stem'])
    unit = lambda o: set(w for w in stems(o) if not w.isdigit())
    scores = []
    for k, o in enumerate(opts):
        n = on[k][0]
        best = 0
        for m in re.finditer(rf'(?<![\d.,-]){n}(?![\d])', text):
            win = text[max(0, m.start() - 220): m.end() + 120]
            after = text[m.end(): m.end() + 25]
            sc = len(stems(win) & q)
            u = unit(o)
            if u and not (stems(after) & u):
                sc -= 2
            best = max(best, sc)
        scores.append(best)
    key = it['answer'][0]
    neg = bool(NEG.search(it['stem']))
    others = [c for j, c in enumerate(scores) if j != key]
    if neg:
        return 'weak'
    if scores[key] >= 3 and scores[key] > max(others):
        return 'ok'
    if max(others) > scores[key] + 1:
        return 'conflict'
    return 'weak'


def judge(it, sents, text=''):
    if text and it['answer'] and not it.get('statements') and len(it['answer']) == 1:
        v = numeric_judge(it, text)
        if v:
            return v, None
    q = stems(it['stem'] + ' ' + ' '.join(it.get('statements') or []))
    if not q or not sents:
        return 'nolaw', None
    ranked = sorted(sents, key=lambda s: len(s[1] & q), reverse=True)[:6]
    opts = it['options']
    cov = []
    for o in opts:
        os_ = stems(o)
        on = nums(o)
        best = 0.0
        for _, ss, sn in ranked:
            c = len(os_ & ss) / max(1, len(os_))
            if on:
                c = c * 0.5 + (0.5 if on <= sn else 0.0)
            best = max(best, c)
        cov.append(best)
    if not it['answer']:
        return 'nokey', cov
    neg = bool(NEG.search(it['stem']))
    if it.get('statements'):
        return judge_statements(it, ranked, neg), cov
    keys = set(it['answer'])
    kc = [cov[k] for k in keys]
    oc = [c for j, c in enumerate(cov) if j not in keys]
    if not oc:
        return 'ok', cov
    if len(keys) > 1:
        return ('ok' if (min(kc) > max(oc)) != neg else 'weak'), cov
    k = kc[0]
    if ALL_ABOVE.search(opts[list(keys)[0]]):
        return ('ok' if min(oc) >= 0.6 else 'weak'), cov
    if neg:
        if k < min(oc) - 0.08:
            return 'ok', cov
        if max(oc) >= 0.7 and k >= max(oc) + 0.15:
            return 'weak', cov
        lowest = min(range(len(cov)), key=lambda j: cov[j])
        return ('conflict' if lowest not in keys and cov[lowest] < k - 0.2 and min(oc) < 0.35 else 'weak'), cov
    if k >= 0.85 and max(oc) >= 0.85 and not ALL_ABOVE.search(' '.join(opts)):
        return ('ok' if distinguishing_ok(it, ranked, cov) else 'multi'), cov
    if k >= 0.5 and k >= max(oc) + 0.08:
        return 'ok', cov
    if max(oc) >= 0.7 and max(oc) >= k + 0.15:
        return 'conflict', cov
    return 'weak', cov


def distinguishing_ok(it, ranked, cov):
    """Near-identical options: the words that tell the key apart from each strong distractor must be in the law
    passage and the distractor's own distinguishing words must not."""
    key = it['answer'][0]
    ks, kn = stems(it['options'][key]), nums(it['options'][key])
    ctx_s, ctx_n = set(), set()
    for _, ss, sn in ranked[:3]:
        ctx_s |= ss
        ctx_n |= sn
    for j, o in enumerate(it['options']):
        if j == key or cov[j] < 0.85:
            continue
        ds, dn = stems(o), nums(o)
        only_k = (ks - ds) | {'#' + n for n in kn - dn}
        only_d = (ds - ks) | {'#' + n for n in dn - kn}
        def sup(words):
            if not words:
                return 1.0
            return sum(1 for w in words if (w[1:] in ctx_n if w.startswith('#') else w in ctx_s)) / len(words)
        if not (sup(only_k) > sup(only_d)):
            return False
    return True


def judge_statements(it, ranked, neg):
    """Questions over numbered statements: the keyed option names the statements that are true (or not)."""
    st = it['statements']
    key_opt = it['options'][it['answer'][0]] if it['answer'] else ''
    chosen = {int(x) for x in re.findall(r'\d+', key_opt) if 0 < int(x) <= len(st)}
    if not chosen:
        return 'weak'
    cov = []
    for s in st:
        ss, sn = stems(s), nums(s)
        best = 0.0
        for _, ls, ln in ranked:
            c = len(ss & ls) / max(1, len(ss))
            if sn:
                c = c * 0.5 + (0.5 if sn <= ln else 0.0)
            best = max(best, c)
        cov.append(best)
    inside = [cov[i - 1] for i in chosen]
    outside = [c for i, c in enumerate(cov, 1) if i not in chosen]
    if not outside:
        return 'weak'
    good = min(inside) > max(outside) if not neg else max(inside) < min(outside)
    return 'ok' if good else ('conflict' if (max(outside) - min(inside) > 0.3 and not neg) else 'weak')


def main():
    show = '--show' in sys.argv or '--weak' in sys.argv
    global SHOW
    SHOW = {'conflict', 'multi', 'nokey', 'nolaw'} | ({'weak'} if '--weak' in sys.argv else set())
    topics = [a for a in sys.argv[1:] if not a.startswith('--')]
    b = json.load(open(BUNDLE))
    verified = json.load(open(VERIFIED)) if os.path.exists(VERIFIED) else {}
    if not topics:
        topics = [t['id'] for t in b['topics']]
    total = {}
    for topic in topics:
        sents = law_sentences(b, topic)
        text = law_text(b, topic)
        seen = set()
        for it in b['items']:
            if it['topicId'] != topic or it.get('pool') == 'formative' or it['status'] != 'published' or it['unitId'] in seen:
                continue
            seen.add(it['unitId'])
            verdict, cov = judge(it, sents, text)
            if it['id'] in verified:
                verdict = 'verified'
            total.setdefault(topic, {}).setdefault(verdict, 0)
            total[topic][verdict] += 1
            if show and verdict in SHOW:
                print(f'[{verdict}] {it["id"]} | {it["stem"]}')
                for k, s in enumerate(it.get('statements') or []):
                    print(f'      [{k + 1}] {s}')
                for k, o in enumerate(it['options']):
                    mark = '*' if k in it['answer'] else ' '
                    print(f'   {"ABCDEFGH"[k]}{mark} {o}  ({cov[k]:.2f})' if cov else f'   {"ABCDEFGH"[k]}{mark} {o}')
                q = stems(it['stem'] + ' ' + ' '.join(it.get('statements') or []))
                for txt, ss, _ in sorted(sents, key=lambda s: len(s[1] & q), reverse=True)[:2]:
                    print(f'   law: {txt[:380]}')
    for t, v in total.items():
        print(t, v, file=sys.stderr)


if __name__ == '__main__':
    main()
