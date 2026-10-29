"""Diagnostics: parse every test file and print question/key coverage."""
import sys, os, re, json
from collections import Counter
sys.path.insert(0, os.path.dirname(__file__))
from textutil import strip_branding, cut_promo_tail, build_vocab, fix_split_words
from parse_tests import parse_test
src = sys.argv[1]
titles = {}
for l in open(os.path.join(src, 'files.tsv')):
    i, s, n = l.rstrip('\n').split('\t'); titles[i] = n
texts = {i: open(os.path.join(src, os.environ.get('TXT','ptxt'), i + '.txt')).read() for i in titles if os.path.exists(os.path.join(src, 'ptxt', i + '.txt'))}
vocab = build_vocab(texts.values())
only = sys.argv[2] if len(sys.argv) > 2 else None
for i, n in sorted(titles.items(), key=lambda x: x[1]):
    if not re.search(r'Test|Qliz', n) or (only and only not in n): continue
    t = fix_split_words(cut_promo_tail(strip_branding(texts[i])), vocab)
    qs, key = parse_test(t)
    types = Counter(q['type'] for q in qs)
    with_ans = sum(1 for q in qs if q['answer'] is not None)
    dist = Counter(chr(65 + q['answer'][0]) for q in qs if q['answer'] and q['type'] == 'single')
    print(f"{n[:50]:50} q={len(qs):3} key={len(key):3} ans={with_ans:3} {dict(types)} {dict(sorted(dist.items()))}")
    if only:
        for q in qs[:4] + qs[-2:]:
            print(json.dumps(q, ensure_ascii=False)[:600])
