"""python3 tools/content/lawgrep.py <topic> <regex> [width] - law text around each match."""
import json
import re
import sys
from review import BUNDLE

topic, pat = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 220
b = json.load(open(BUNDLE))
les = {l['id']: l for l in b['lessons']}
for c in b['cards']:
    if c['kind'] != 'law' or les.get(c['lessonId'], {}).get('topicId') != topic:
        continue
    for m in re.finditer(pat, c['body'], re.I):
        print(f"[{c['title'][:40]}] …{c['body'][max(0, m.start() - width):m.end() + width]}…".replace('\n', ' '))
        print()
