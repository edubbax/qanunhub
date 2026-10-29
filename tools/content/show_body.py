import sys, os, re
sys.path.insert(0, os.path.dirname(__file__))
from textutil import strip_branding, cut_promo_tail
src = sys.argv[1]; key = sys.argv[2]; pat = sys.argv[3]; n = int(sys.argv[4])
for l in open(os.path.join(src, 'files.tsv')):
    i, s, t = l.rstrip('\n').split('\t')
    if key in t:
        lines = cut_promo_tail(strip_branding(open(os.path.join(src, 'ptxt', i + '.txt')).read())).split('\n')
        for k, x in enumerate(lines):
            if re.search(pat, x):
                print('|'.join(lines[k:k+n])); break
        break
