"""Lesson system 2.0 content: key facts and exam frequency per law card, and number drills built from the law text.

Everything here is derived from the law cards themselves, so a drill is correct by construction: the sentence is the
law's own wording, the right option is the number the law uses, and the wrong options are other numbers of the same
kind (days, votes, years) that do not occur in that sentence.
"""
import re
from collections import Counter, defaultdict

# --------------------------------------------------------------------------- numbers in the law text

WORD_NUM = {
    'bir': 1, 'iki': 2, 'üç': 3, 'dörd': 4, 'beş': 5, 'altı': 6, 'yeddi': 7, 'səkkiz': 8, 'doqquz': 9, 'on': 10,
    'on beş': 15, 'iyirmi': 20, 'otuz': 30, 'qırx': 40, 'əlli': 50, 'altmış': 60, 'doxsan': 90, 'yüz': 100,
}
NUM_WORD = {v: k for k, v in WORD_NUM.items()}
UNITS = ['iş günü', 'təqvim günü', 'gün', 'həftə', 'ay', 'il', 'saat', 'faiz', 'səs çoxluğu', 'deputat', 'nəfər', 'hakim']
# Plausible values per unit: the wrong options are drawn from here, never from the sentence being asked.
CHOICES = {
    'iş günü': [3, 5, 7, 10, 15, 20, 30], 'təqvim günü': [6, 10, 15, 21, 30, 45, 60], 'gün': [3, 5, 7, 10, 14, 15, 20, 30, 45, 56, 60, 90],
    'həftə': [1, 2, 3, 4], 'ay': [1, 2, 3, 6, 9, 12], 'il': [1, 2, 3, 5, 7, 10, 15],
    'saat': [12, 24, 48, 72, 96], 'faiz': [2, 5, 10, 15, 20, 30, 50], 'səs çoxluğu': [42, 63, 83, 95],
    'deputat': [42, 63, 83, 95], 'nəfər': [5, 7, 9, 11, 15, 18], 'hakim': [3, 5, 7, 9, 11],
}
NUM_RX = r'(?:\d{1,3}|on beş|' + '|'.join(sorted((w for w in WORD_NUM if w != 'on beş'), key=len, reverse=True)) + r')'
UNIT_RX = '|'.join(re.escape(u) for u in UNITS)
# 'bir' and 'on' are too common as ordinary words; as numbers they must be followed by a unit right away.
QTY = re.compile(r'(?<![\w-])(?P<num>' + NUM_RX + r')(?P<case>-[a-zəöüğçşı]+)?\s+(?P<unit>' + UNIT_RX + r')(?![\w])')
CLEAN_SENT = re.compile(r'^[A-ZƏÖÜÇŞĞİ]')
BAD = re.compile(r'\[izah|\.\.\.|…|\(\s*\)|\s{2,}|[A-Za-zƏəÖöÜüĞğÇçŞşİı]-\s|https?:|@')


def value(num: str) -> int:
    return int(num) if num.isdigit() else WORD_NUM[num]


def render(v: int, like: str) -> str:
    """The number written the way the law wrote the original: digits stay digits, words stay words."""
    return str(v) if like.isdigit() or v not in NUM_WORD else NUM_WORD[v]


def sentences(body: str) -> list:
    """Splits a law card into sentences and list points, without the numbering ('28.1.', 'II.', '3)')."""
    parts = re.split(r'(?<=[.;:])\s+(?=(?:\d+(?:\.\d+)*\.?|[IVX]+\.|\d+\))\s|[A-ZƏÖÜÇŞĞİ])', body)
    out = []
    for p in parts:
        p = re.sub(r'^(?:\d+(?:[.-]\d+)*\.?|[IVX]+\.|\d+\))\s+', '', p.strip())
        p = re.sub(r'\s+(?:\d+(?:[.-]\d+)*\.?|[IVX]+\.)$', '', p)  # the next point's number left at the end
        if p:
            out.append(p)
    return out


def facts(body: str, limit: int = 3) -> list:
    """Sentences of a card worth remembering word for word: those with a number of days, votes, years or a share."""
    seen, out = set(), []
    for s in sentences(body):
        if not QTY.search(s) or BAD.search(s) or len(s) < 30 or len(s) > 260:
            continue
        key = s[:60]
        if key in seen:
            continue
        seen.add(key)
        out.append(s.rstrip(';:') if s.endswith((';', ':')) else s)
        if len(out) >= limit:
            break
    return out


# --------------------------------------------------------------------------- exam frequency

WORD = re.compile(r'[A-Za-zƏəÖöÜüĞğÇçŞşİı]{4,}')
STOP = {'azərbaycan', 'respublikası', 'respublikasının', 'olaraq', 'haqqında', 'qanununa', 'qanunun', 'əsasən', 'uyğun',
        'aşağıdakılardan', 'hansı', 'hansıdır', 'doğru', 'düzgün', 'deyil', 'müəyyən', 'edilir', 'edin', 'olan', 'olunur',
        'qanunu', 'konstitusiyasına', 'variantı', 'seçin', 'bəndi', 'müddəa', 'fikir', 'tərəfindən', 'həmin', 'habelə'}


def stems(text: str) -> set:
    return {w.lower()[:6] for w in WORD.findall(text) if w.lower() not in STOP}


def heat(bundle: dict) -> None:
    """Counts how many exam questions are about each law card and stores it as card['examCount'] and a 0-3 level."""
    lesson_topic = {l['id']: l['topicId'] for l in bundle['lessons']}
    cards_by_topic = defaultdict(list)
    for c in bundle['cards']:
        if c['kind'] == 'law':
            cards_by_topic[lesson_topic[c['lessonId']]].append((c, stems(c['body'] + ' ' + (c.get('title') or ''))))
    counts = Counter()
    for it in bundle['items']:
        if it['status'] != 'published' or it.get('pool', 'exam') != 'exam':
            continue
        q = stems(it['stem'] + ' ' + ' '.join(it['options'][a] for a in it['answer'] if a < len(it['options'])))
        if len(q) < 3:
            continue
        best, score = None, 0.0
        for c, cs in cards_by_topic.get(it['topicId'], []):
            s = len(q & cs) / len(q)
            if s > score:
                best, score = c, s
        if best is not None and score >= 0.5:
            counts[best['id']] += 1
    for c in bundle['cards']:
        if c['kind'] != 'law':
            continue
        n = counts.get(c['id'], 0)
        c['examCount'] = n
        c['heat'] = 0 if n == 0 else 1 if n <= 2 else 2 if n <= 5 else 3


# --------------------------------------------------------------------------- number drills

def cloze_items(bundle: dict, per_card: int = 2, per_lesson: int = 8) -> int:
    lessons = {l['id']: l for l in bundle['lessons']}
    made_per_lesson = Counter()
    n_made = 0
    for c in sorted(bundle['cards'], key=lambda c: (c['lessonId'], c['order'])):
        if c['kind'] != 'law':
            continue
        lesson = lessons[c['lessonId']]
        made = 0
        for k, s in enumerate(sentences(c['body'])):
            if made >= per_card or made_per_lesson[lesson['id']] >= per_lesson:
                break
            hits = list(QTY.finditer(s))
            if len(hits) != 1 or BAD.search(s) or not CLEAN_SENT.match(s) or not (50 <= len(s) <= 280) or not s.endswith(('.', ';')):
                continue
            m = hits[0]
            unit, num, case = m.group('unit'), m.group('num'), m.group('case') or ''
            if case and not num.isdigit():
                continue  # 'ikinci' style ordinals are not quantities
            v = value(num)
            choices = [x for x in CHOICES[unit] if x != v and str(x) not in s and NUM_WORD.get(x, '#') not in s.split()]
            if not num.isdigit():
                choices = [x for x in choices if x in NUM_WORD]  # words stay words, or the digits give the answer away
            if v not in CHOICES[unit] and not (CHOICES[unit][0] <= v <= CHOICES[unit][-1] * 2):
                continue
            if len(choices) < 3:
                continue
            # Nearest values first: the wrong options should look like the right one, not be absurd.
            choices.sort(key=lambda x: (abs(x - v), x))
            wrong = sorted(choices[:3])
            right = f'{render(v, num)}{case} {unit}'
            opts = [right] + [f'{render(x, num)}{case} {unit}' for x in wrong]
            blank = s[:m.start()] + '_____' + s[m.end():]
            iid = f"{c['id']}-z{k}"
            unit_id = f"{lesson['id']}-z-{c['order']}-{k}"
            bundle['units'].append({'id': unit_id, 'topicId': lesson['topicId'], 'lessonId': lesson['id'],
                                    'categories': list(lesson['categories']), 'importance': 2, 'pool': 'drill'})
            bundle['items'].append({
                'id': iid, 'unitId': unit_id, 'topicId': lesson['topicId'], 'lessonId': lesson['id'],
                'categories': list(lesson['categories']), 'type': 'single', 'format': 'cloze',
                'stem': f'Boşluğu qanunun mətninə uyğun doldur: «{blank}»',
                'options': opts, 'answer': [0], 'points': 1,
                'explanation': f'Qanunun mətni: «{s}»', **({'ref': c['ref']} if c.get('ref') else {}),
                'status': 'published', 'flags': ['generated'], 'pool': 'drill',
            })
            made += 1
            made_per_lesson[lesson['id']] += 1
            n_made += 1
    return n_made


def enrich(bundle: dict) -> dict:
    for c in bundle['cards']:
        if c['kind'] == 'law':
            f = facts(c['body'])
            if f:
                c['facts'] = f
    heat(bundle)
    n = cloze_items(bundle)
    return {'cloze': n, 'cardsWithFacts': sum(1 for c in bundle['cards'] if c.get('facts')),
            'hotCards': sum(1 for c in bundle['cards'] if c.get('heat', 0) >= 2)}
