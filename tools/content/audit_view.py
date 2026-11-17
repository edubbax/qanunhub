"""Compact view of the questions audit.py flags: key, the words that set each strong distractor apart, the law passage.

    python3 tools/content/audit_view.py <topic> [--kinds conflict,multi]
"""
import json
import re
import sys

from audit import BUNDLE, VERIFIED, judge, law_sentences, law_text, stems, nums, NEG, WORD
import os


def words(t):
    return [w for w in WORD.findall(t.lower())]


def diff(a, b):
    wa, wb = words(a), words(b)
    sa, sb = set(wa), set(wb)
    return ' '.join(w for w in wa if w not in sb)[:150], ' '.join(w for w in wb if w not in sa)[:150]


def main():
    topic = sys.argv[1]
    kinds = {'conflict', 'multi', 'nokey', 'nolaw'}
    if '--kinds' in sys.argv:
        kinds = set(sys.argv[sys.argv.index('--kinds') + 1].split(','))
    b = json.load(open(BUNDLE))
    ver = json.load(open(VERIFIED)) if os.path.exists(VERIFIED) else {}
    sents = law_sentences(b, topic)
    text = law_text(b, topic)
    seen = set()
    for it in b['items']:
        if it['topicId'] != topic or it.get('pool') == 'formative' or it['status'] != 'published' or it['unitId'] in seen:
            continue
        seen.add(it['unitId'])
        if it['id'] in ver:
            continue
        v, cov = judge(it, sents, text)
        if v not in kinds:
            continue
        key = it['answer'][0] if it['answer'] else -1
        neg = 'NEG ' if NEG.search(it['stem']) else ''
        print(f'## [{v}] {it["id"]} {neg}| {it["stem"][:220]}')
        for k, s in enumerate(it.get('statements') or []):
            print(f'   [{k + 1}] {s[:200]}')
        for k, o in enumerate(it['options']):
            mark = '*' if k in it['answer'] else ' '
            if k == key or len(o) < 90 or it.get('statements'):
                print(f'   {"ABCDEFGH"[k]}{mark} {o[:230]}')
            else:
                only_k, only_d = diff(it['options'][key], o)
                print(f'   {"ABCDEFGH"[k]}{mark} ≠key: +[{only_d}] −[{only_k}]')
        q = stems(it['stem'] + ' ' + ' '.join(it.get('statements') or []) + (' ' + it['options'][key] if key >= 0 else ''))
        for txt, ss, _ in sorted(sents, key=lambda s: len(s[1] & q), reverse=True)[:2]:
            print(f'   law: {txt[:330]}')


if __name__ == '__main__':
    main()
