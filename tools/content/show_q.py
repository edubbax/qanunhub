import sys, os, re, json
sys.path.insert(0, os.path.dirname(__file__))
from textutil import strip_branding, cut_promo_tail, build_vocab, fix_split_words
from parse_tests import parse_test
src, key, txt = sys.argv[1], sys.argv[2], sys.argv[3]
for l in open(os.path.join(src, 'files.tsv')):
    i, s, t = l.rstrip('\n').split('\t')
    if key in t:
        x = cut_promo_tail(strip_branding(open(os.path.join(src, txt, i + '.txt')).read()))
        qs, k = parse_test(x)
        bad = [q for q in qs if q['answer'] is None]
        for q in bad[:int(sys.argv[4]) if len(sys.argv)>4 else 3]:
            print(json.dumps({k2: q[k2] for k2 in ('no','type','stem','statements','options','raw_key')}, ensure_ascii=False)[:700])
        break
