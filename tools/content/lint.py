"""Finds structural defects left by PDF extraction in the built content. Usage: python3 lint.py content.json"""
import json
import re
import sys
from collections import defaultdict

PART = re.compile(r'\s(?=(?:[IVX]{1,6}|\d{1,3}(?:-\d+)?(?:\.\d+){1,3})\.\s+\S)')


def lint(b):
    out = defaultdict(list)
    for c in b['cards']:
        body, title = c['body'], c.get('title') or ''
        if c['kind'] == 'law':
            if re.search(r'\bMaddə\s+\S+\s+\d+\s*\.', body) or re.search(r'(?<![«"(\w])Maddə \d+(?:-\d+)?\. [A-ZƏÖÜÇŞĞİ]', body):
                out['article_inside'].append((c['id'], re.search(r'.{0,40}Maddə.{0,60}', body).group(0)))
            if re.search(r'\s\d+(?:-\d+)?(?:\.\d+)+\.$', body):
                out['dangling_number'].append((c['id'], body[-30:]))
            m = PART.search(body)
            head = body[:m.start()] if m else ''
            if head and '(davamı)' not in title and '— Qeyd' not in title and len(head) < 160 and not re.search(r'[.;:!?»”)]$', head.strip()):
                out['title_in_body'].append((c['id'], title[-40:], head[:100]))
            if re.search(r'\b[A-Z]{2,4}\d\b', body):
                out['codes'].append((c['id'], re.search(r'.{0,30}\b[A-Z]{2,4}\d\b.{0,10}', body).group(0)))
        m = re.search(r'\b((?:\w+\s+){4,10}\w+)\s+\1\b', body)
        if m:
            out['repeat'].append((c['id'], m.group(1)[:80]))
        if c['kind'] == 'qa' and re.match(r'^[a-zəöüğçşı]|^Respublikasının', title):
            out['qa_title_cut'].append((c['id'], title[:70]))
    for i in b['items']:
        t = i['stem']
        m = re.search(r'\b((?:\w+\s+){4,10}\w+)\s+\1\b', t)
        if m:
            out['item_repeat'].append((i['id'], m.group(1)[:60]))
    return out


if __name__ == '__main__':
    res = lint(json.load(open(sys.argv[1], encoding='utf-8')))
    for k, v in res.items():
        print(f'== {k}: {len(v)}')
        for x in v[:int(sys.argv[2]) if len(sys.argv) > 2 else 8]:
            print('   ', x)
