"""Adds reviewed fixes: python3 tools/content/fixadd.py '<json object of id -> fix>'  (merged into content/fixes/items.json),
or `phrase old new` to add an exact text replacement."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FIXES = os.path.join(HERE, '..', '..', 'content', 'fixes')

if sys.argv[1] == 'phrase':
    p = os.path.join(FIXES, 'phrases.json')
    d = json.load(open(p))
    for old, new in zip(sys.argv[2::2], sys.argv[3::2]):
        if [old, new] not in d['replace']:
            d['replace'].append([old, new])
    json.dump(d, open(p, 'w'), ensure_ascii=False, indent=2)
else:
    p = os.path.join(FIXES, 'items.json')
    d = json.load(open(p))
    d.update(json.loads(sys.argv[1]))
    json.dump(d, open(p, 'w'), ensure_ascii=False, indent=1)
print('ok')
