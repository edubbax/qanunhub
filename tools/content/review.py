"""Compact listing of source questions for answer-key review.

    python3 tools/content/review.py dump <topic> [start] [count]   # one line per unit, key marked with *
    python3 tools/content/review.py count <topic>
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE, '..', '..', 'content', 'build', 'content.json')
LETTERS = 'ABCDEFGH'


def units(topic: str):
    b = json.load(open(BUNDLE))
    out = {}
    for i in b['items']:
        if i['topicId'] != topic or i.get('pool') == 'formative':
            continue
        out.setdefault(i['unitId'], []).append(i)
    return [out[k] for k in sorted(out)]


def norm(t: str) -> str:
    import re
    return re.sub(r'\s+', '', t).lower()


def line(i) -> str:
    st = ''
    if i.get('statements'):
        st = ' ' + ' '.join(f'[{n + 1}] {s}' for n, s in enumerate(i['statements']))
    opts = ' '.join(f'{LETTERS[n]}{"*" if n in i["answer"] else ""}) {o}' for n, o in enumerate(i['options']))
    flags = f' {{{",".join(i["flags"])}}}' if i['flags'] else ''
    status = '' if i['status'] == 'published' else f' <{i["status"]}>'
    return f'{i["id"]}{status}{flags} | {i["stem"]}{st} | {opts}'


def main():
    cmd, topic = sys.argv[1], sys.argv[2]
    us = units(topic)
    if cmd == 'count':
        print(len(us), 'units', sum(len(u) for u in us), 'items')
        return
    start = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    count = int(sys.argv[4]) if len(sys.argv) > 4 else 60
    for n, u in enumerate(us[start:start + count], start=start):
        first = u[0]
        print(f'#{n} {line(first)}')
        key = sorted(norm(first['options'][a]) for a in first['answer'])
        for other in u[1:]:
            if sorted(norm(other['options'][a]) for a in other['answer']) != key or other['status'] != first['status']:
                print(f'   ~ {line(other)}')


if __name__ == '__main__':
    main()
