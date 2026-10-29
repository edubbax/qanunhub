import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from textutil import strip_branding, cut_promo_tail
from parse_tests import _split_key_region
src = sys.argv[1]; key = sys.argv[2]
for l in open(os.path.join(src, 'files.tsv')):
    i, s, t = l.rstrip('\n').split('\t')
    if key in t:
        x = cut_promo_tail(strip_branding(open(os.path.join(src, 'ptxt', i + '.txt')).read()))
        lines = x.split('\n'); k = _split_key_region(lines)
        print('KEYREGION:', '|'.join(lines[k:])[:700]); print('BEFORE:', '|'.join(lines[max(0,k-25):k])[:900])
        break
