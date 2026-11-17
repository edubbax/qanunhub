"""Print full questions by id: python3 tools/content/show_ids.py id [id ...]"""
import json
import os
import sys

B = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'content', 'build', 'content.json')))
by = {i['id']: i for i in B['items']}
for k in sys.argv[1:]:
    i = by[k]
    print(f'{k} key={[ "ABCD"[a] for a in i["answer"]]} | {i["stem"]}')
    for n, s in enumerate(i.get('statements') or []):
        print(f'  [{n + 1}] {s}')
    for n, o in enumerate(i['options']):
        print(f'  {"ABCDEFGH"[n]}{"*" if n in i["answer"] else " "} {o}')
