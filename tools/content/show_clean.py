import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from textutil import strip_branding, cut_promo_tail
src = sys.argv[1]; key = sys.argv[2]; n = int(sys.argv[3]) if len(sys.argv) > 3 else 60
for l in open(os.path.join(src, 'files.tsv')):
    i, s, t = l.rstrip('\n').split('\t')
    if key in t:
        x = cut_promo_tail(strip_branding(open(os.path.join(src, 'ptxt', i + '.txt')).read()))
        print('|'.join(x.split('\n')[-n:]))
        break
