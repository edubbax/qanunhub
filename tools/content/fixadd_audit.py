"""Merge audit decisions into content/fixes: python3 tools/content/fixadd_audit.py decisions.json

decisions.json: {"fix": {item_id: fix, ...}, "ok": {item_id: note, ...}}. Fixes use the items.json format
(replace / options / answer / expect / draft / note); "ok" records a key confirmed against the law.
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
ITEMS = os.path.join(ROOT, 'content', 'fixes', 'items.json')
VERIFIED = os.path.join(ROOT, 'content', 'fixes', 'verified.json')


def main():
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    items = json.load(open(ITEMS, encoding='utf-8'))
    ver = json.load(open(VERIFIED, encoding='utf-8')) if os.path.exists(VERIFIED) else {'_about': 'Answer keys read against the law text and confirmed (tools/content/audit.py).'}
    for k, v in d.get('fix', {}).items():
        if k in items:
            old = items[k]
            for key in ('replace',):
                if key in old and key in v:
                    v[key] = old[key] + [p for p in v[key] if p not in old[key]]
            old.update(v)
        else:
            items[k] = v
        ver[k] = v.get('note', 'fixed')
    for k, note in d.get('ok', {}).items():
        ver.setdefault(k, note)
    json.dump(items, open(ITEMS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(ITEMS, 'a').write('\n')
    json.dump(ver, open(VERIFIED, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(VERIFIED, 'a').write('\n')
    print('fixes', len(d.get('fix', {})), 'ok', len(d.get('ok', {})), 'verified total', len(ver) - 1)


if __name__ == '__main__':
    main()
