"""Answer-key review aid: each source question with the law sentences that match it best.

    python3 tools/content/check.py <topic> [start] [count]

Sentences are scored by shared word stems with the question and an option. '!' marks a question where a
distractor matches the law better than the key (worth a closer look; for 'not/false' questions it is expected).
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from review import BUNDLE, LETTERS, units  # noqa: E402

WORD = re.compile(r"[A-Za-zƏəÖöÜüĞğÇçŞşİıI0-9]+")
STOP = set('və ilə üçün olan olunur edilir bu həmin aşağıdakı hansı hansıdır kim nədir ar azərbaycan respublikasının '
           'respublikası qanun qanunu haqqında üzrə görə əsasən olaraq bir hər heç ya yaxud da də ki isə yalnız habelə '
           'digər kimi edilməsi müvafiq müəyyən tərəfindən düzgün doğru deyil aid'.split())


def stems(t: str) -> set:
    out = set()
    for w in WORD.findall(t.lower()):
        if w in STOP or len(w) < 3:
            continue
        out.add(w[:6] if not w.isdigit() else w)
    return out


def sentences(topic: str):
    b = json.load(open(BUNDLE))
    les = {l['id']: l for l in b['lessons']}
    out = []
    for c in b['cards']:
        if c['kind'] != 'law' or les.get(c['lessonId'], {}).get('topicId') != topic:
            continue
        art = re.match(r'Maddə [\d-]+', c['title'] or '')
        for s in re.split(r'(?<=[.;:])\s+(?=[A-ZƏÖÜĞÇŞİ0-9])', c['body']):
            if len(s) > 25:
                out.append(((art.group(0) if art else '') + ' ' + s, stems(s)))
    return out


def main():
    topic = sys.argv[1]
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    sents = sentences(topic)
    for n, u in enumerate(units(topic)[start:start + count], start=start):
        it = u[0]
        q = stems(it['stem'] + ' ' + ' '.join(it.get('statements') or []))

        def best(opt: str):
            o = stems(opt)
            scored = sorted(((len(s & q) + 2 * len(s & o), txt) for txt, s in sents), reverse=True)
            return scored[0] if scored else (0, '')
        scores = [best(o)[0] for o in it['options']]
        key = it['answer'][0] if it['answer'] else 0
        flag = '!' if not it['answer'] or max(scores) > scores[key] else ' '
        st = '' if it['status'] == 'published' else f' <{it["status"]}>'
        print(f'{flag}#{n} {it["id"]}{st} | {it["stem"]}')
        for k, s in enumerate(it.get('statements') or []):
            print(f'     [{k + 1}] {s}')
        for k, o in enumerate(it['options']):
            print(f'   {LETTERS[k]}{"*" if k in it["answer"] else " "} {o}')
        sc, txt = best(it['options'][key])
        print(f'   law: {txt[:420]}')


if __name__ == '__main__':
    main()
