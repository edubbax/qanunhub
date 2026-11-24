"""Repairs the notes ("Qeyd") that the PDF layout broke apart.

In the source PDFs a note sits next to the article as a table cell. Text extraction kept only the first line of the
note on the note card and appended the rest to the neighbouring law card (or turned it into a "(davamı)" card),
so some "Yadda saxla" cards read just "Qeyd:" while law cards end with stray note text. Two kinds of note exist:

* official notes, part of the law itself (Labour Code, Civil Service Law): rebuilt as one law card titled
  "<article> — Qeyd" placed right after the article;
* author's memory aids (Constitution, Ethics Law): rebuilt as complete "Qeyd" note cards.

Q&A answers that swallowed a note ("Dövlət dilində Qeyd: ...") keep the note as a separate paragraph, which the app
shows as a callout. Every repair checks the text it expects first, so the step is safe to run more than once.

Usage: python3 notes.py content/build/content.json   (also called from build.py)
"""
import json
import re
import sys

NOTE_TITLE = 'Qeyd'

# Author's memory aids: card id -> full note text (written from the source PDF, without the layout debris).
AUTHOR_NOTES = {
    'konstitusiya-001-c3': 'Seçki hüququnun əsası: ümumi, bərabər və birbaşa. Səsvermə yolu: sərbəst, gizli və şəxsi.',
    'konstitusiya-003-c3': ('Demokratik — «demos» (xalq) və «kratos» (hakimiyyət) sözlərindən: xalqın hakimiyyət mənbəyi kimi '
                            'tanınmasına, dövlət işlərinin həllində iştirak hüququna və vətəndaşlara geniş hüquq və azadlıqlar '
                            'verilməsinə əsaslanan siyasi təşkil forması. Hüquqi dövlət — qanunun aliliyini təmin edən dövlət. '
                            'Dünyəvi — dinin dövlət idarəçiliyindən ayrı olması. Unitar — vahid, ayrılmaz dövlət; ərazisi siyasi '
                            'müstəqilliyi olmayan inzibati ərazi vahidlərinə bölünür.'),
    'konstitusiya-005-c4': ('Konstitusiyanın 34-cü maddəsinə əsasən uşaqlara qayğı göstərmək və onları tərbiyə etmək '
                            'valideynlərin həm hüququ, həm də borcudur.'),
    'konstitusiya-012-c5': ('40-cı maddədə «hər kəs» ifadəsi işlədilir; 77-ci maddədə isə tarix və mədəniyyət abidələrini '
                            'qorumaq «hər bir şəxsin» borcu kimi göstərilir.'),
    'konstitusiya-024-c4': ('Milli Məclisin sessiyaları növbəti (yaz və payız) və növbədənkənar olur. Növbədənkənar sessiyanı '
                            'Milli Məclisin sədri çağırır; onun çağırılmasını AR Prezidenti və ya 42 deputat tələb edə bilər.'),
    'konstitusiya-033-c4': ('Şəxsi toxunulmazlıq hüququ hər kəsə aiddir. AR Prezidenti toxunulmazlıq hüququna malikdir; '
                            'deputatlar, vitse-prezidentlər və Baş nazir isə səlahiyyət müddəti ərzində toxunulmazdır.'),
    'etik-001-c2': ('Etik davranış qaydaları haqqında Qanuna görə dövlət qulluqçusu qanunun aliliyini, insan hüquqlarını, '
                    'demokratik prinsipləri və yüksək etik davranış qaydalarını rəhbər tutur. «Dövlət qulluğu haqqında» '
                    'Qanuna görə isə AR Konstitusiyasını, AR qanunlarını və müvafiq qanunvericilik aktlarını rəhbər tutur.'),
}

# Cards that are not law text at all: the note's debris, a list of quiz questions, quiz answer options.
DROP = {
    'konstitusiya-003-c2': 'Demokratik - ',          # the definitions now live in the note card
    'konstitusiya-006-c6': 'Azərbaycan dövlətinin təməlini nə təşkil edir?',  # a list of questions
    'konstitusiya-024-c3': '5. Milli Məclisin sessiyaları 83 deputatının',     # quiz answer options, some false
}

# Note debris appended to a law card: card id -> the text it starts with (cut from there to the end).
TAILS = {
    'etik-001-c1': ' qanunun aliliyi, insan hüquqları, demokratik prinsipləri yüksək etik',
}

# Official notes: (note card, law cards that hold the rest of it in order, (card, tail start) to cut from).
OFFICIAL = [
    ('dovlet-qullugu-036-c3', [], ('dovlet-qullugu-036-c2', ' müvəqqəti işləyən, dövlət qulluqçusu olmayan işçinin')),
    ('dovlet-qullugu-038-c11', ['dovlet-qullugu-038-c9', 'dovlet-qullugu-038-c10'], None),
    ('emek-011-c3', [], ('emek-011-c2', ' dərəcəsinə, təcrübəsinə, peşəkarlıq səviyyəsinə')),
    ('emek-014-c7', ['emek-014-c6'], None),
]
# The words lost at the line break between the note card and its continuation.
BRIDGE = {'emek-014-c7': ' etdiyi orqanın (qurumun) rəyi ilə müəyyən edilir.'}

QA_NOTE = re.compile(r'\s*Qeyd:\s*')

# Small text debris anywhere in a card: (pattern, replacement).
CLEAN = [
    (re.compile(r'\s*📃\s*“Konstitusiyanı oxumaq[^”]*”'), ''),  # a portal's slogan glued to an answer
    (re.compile(r'Nazrilər'), 'Nazirlər'),
    # Civil Service Law, art. 33-4: the staj -> pay-step table, flattened by the extractor, as a readable list.
    (re.compile(r'Qulluq stajı \(il\) 1 ilədək 1 ildən 5 ilədək 5 ildən 10 ilədək 10 ildən 15 ilədək 15 ildən 20 ilədək 20 ildən 25 ilədək '
                r'25 ildən yuxarı Əməyin ödəniş pilləsi 1-ci 2-ci 3-cü 4-cü 5-ci 6-cı 7-ci'),
     'Qulluq stajı və əməyin ödəniş pilləsi: 1 ilədək — 1-ci pillə; 1 ildən 5 ilədək — 2-ci pillə; 5 ildən 10 ilədək — 3-cü pillə; '
     '10 ildən 15 ilədək — 4-cü pillə; 15 ildən 20 ilədək — 5-ci pillə; 20 ildən 25 ilədək — 6-cı pillə; 25 ildən yuxarı — 7-ci pillə.'),
    # Constitution, art. 142 III, as the author's scheme rewrote it -> the official wording.
    (re.compile(r'III\. Bələdiyyələrin: Statusunun əsasları bu Konstitusiya ilə, Bələdiyyələrə seçkilərin qaydaları qanunla\. '
                r'Bələdiyyələrin statusu qanunla\.+\s*müəyyən edilir\.?'),
     'III. Bələdiyyələrin statusunun əsasları bu Konstitusiya ilə, bələdiyyələrə seçkilərin qaydaları isə qanunla müəyyən edilir.'),
    (re.compile(r'(?<=\w)\.{4}(?=\S)'), '. '),                 # "qanunla....müəyyən" -> "qanunla. müəyyən"
]


def _article_head(title: str) -> str:
    return re.sub(r'\s*\(davamı\)$', '', title or '').strip()


def fix_notes(bundle: dict) -> dict:
    cards = {c['id']: c for c in bundle['cards']}
    stats = {'author': 0, 'official': 0, 'dropped': 0, 'tails': 0, 'qa': 0}
    drop = set()

    for cid, text in AUTHOR_NOTES.items():
        c = cards.get(cid)
        if c and c['kind'] == 'note' and c['body'] != text:
            c['body'], c['title'] = text, NOTE_TITLE
            stats['author'] += 1

    for cid, start in DROP.items():
        c = cards.get(cid)
        if c and start in c['body']:
            drop.add(cid)

    for cid, start in TAILS.items():
        c = cards.get(cid)
        if c and start in c['body']:
            c['body'] = c['body'][:c['body'].index(start)].rstrip()
            stats['tails'] += 1

    for note_id, rest_ids, tail in OFFICIAL:
        n = cards.get(note_id)
        if not n or n['kind'] != 'note':
            continue
        parts = [n['body'].rstrip()]
        if note_id in BRIDGE:
            parts[0] += BRIDGE[note_id]
        head = None
        if tail:
            src = cards.get(tail[0])
            if not src or tail[1] not in src['body']:
                continue
            i = src['body'].index(tail[1])
            parts.append(src['body'][i:].strip())
            src['body'] = src['body'][:i].rstrip()
            head = _article_head(src['title'])
        for rid in rest_ids:
            r = cards.get(rid)
            if r:
                parts.append(r['body'].strip())
                head = head or _article_head(r['title'])
                drop.add(rid)
        if head is None:  # the article card right before the note
            prev = [c for c in bundle['cards'] if c['lessonId'] == n['lessonId'] and c['kind'] == 'law' and c['order'] < n['order']]
            head = _article_head(prev[-1]['title']) if prev else 'Qeyd'
        body = ' '.join(p for p in parts if p)
        body = re.sub(r'^Qeyd:\s*', '', body)
        n.update(kind='law', title=f'{head} — Qeyd', body=body)
        stats['official'] += 1

    # Q&A answers with a note glued on: "answer Qeyd: note" -> "answer.\n\nQeyd: note".
    for c in bundle['cards']:
        if c['kind'] != 'qa' or 'Qeyd:' not in c['body'] or '\n\nQeyd:' in c['body']:
            continue
        head, *notes = QA_NOTE.split(c['body'])
        head = head.strip()
        if head and head[-1] not in '.!?;:»"':
            head += '.'
        c['body'] = head + ''.join(f'\n\nQeyd: {x.strip()}' for x in notes if x.strip())
        stats['qa'] += 1

    for c in bundle['cards']:
        for rx, rep in CLEAN:
            new = rx.sub(rep, c['body'])
            if new != c['body']:
                c['body'] = new
                stats['clean'] = stats.get('clean', 0) + 1

    # Notes whose text is still only the label are worthless: drop them.
    for c in bundle['cards']:
        if c['kind'] == 'note':
            c['body'] = re.sub(r'^Qeyd:\s*', '', c['body']).strip()
            c['title'] = NOTE_TITLE
            if len(re.sub(r'\W', '', c['body'])) < 12:
                drop.add(c['id'])

    if drop:
        bundle['cards'] = [c for c in bundle['cards'] if c['id'] not in drop]
        gone = tuple(f'{d}-z' for d in drop)
        dead_items = {i['id'] for i in bundle['items'] if i['id'].startswith(gone)}
        dead_units = {i['unitId'] for i in bundle['items'] if i['id'] in dead_items}
        bundle['items'] = [i for i in bundle['items'] if i['id'] not in dead_items]
        bundle['units'] = [u for u in bundle['units'] if u['id'] not in dead_units]
        stats['dropped'] = len(drop)
    return stats



# ----------------------------------------------------------------------------------------------- structure
# Words that may start with a capital inside an article title; any other capitalised word (or "AR", "I.") starts the text.
TITLE_WORDS = {'Azərbaycan', 'Respublikası', 'Respublikasının', 'Respublikasında', 'Respublikasına', 'Milli', 'Məclisi', 'Məclisinin',
               'Nazirlər', 'Kabineti', 'Kabinetinin', 'Konstitusiya', 'Konstitusiyası', 'Konstitusiyasının', 'Konstitusiyasında',
               'Prezidenti', 'Prezidentinin', 'Prezidentliyinə', 'Dövlət', 'Naxçıvan', 'Muxtar', 'Ali', 'Məhkəməsi', 'Məhkəməsinin',
               'Mərkəzi', 'Bankı', 'Prokurorluğu', 'Prokurorluğunun', 'İnsan'}
MERGED_ARTICLE = re.compile(r'\s+Maddə (\d+(?:-\d+)?)\. ')
SCRAMBLED_HEAD = re.compile(r'\s+Maddə (\S+) (\d+(?:-\d+)?) \. (.+?)\s(?=\2\.1\.\s)')  # "Maddə işlənməsi 7 . Dövlət dilinin ... 7.1."
TRAILING_NO = re.compile(r'\s(\d+(?:-\d+)?(?:\.\d+)+\.)$')
REPEAT = re.compile(r'\b((?:[\wəöüğçşıİƏÖÜĞÇŞ-]+\s+){4,10}[\wəöüğçşıİƏÖÜĞÇŞ-]+)\s+\1\b')
TITLE_FIX = {  # card id -> (title, text to cut from the start of the body)
    'konstitusiya-025-c1': (None, 'Azərbaycan Respublikası Milli Məclisinin deputatlarının səlahiyyətlərinin itirilməsi'),
    'etik-003-c1': (None, 'işgüzar nüfuzuna hörmət. Hüquqi şəxslərin işgüzar nüfuzuna hörmət'),
    'informasiya-003-c3': ('Maddə 5. İnformasiya əldə etmək haqqında Azərbaycan Respublikasının qanunvericiliyi', 'Azərbaycan Respublikasının'),
    'dovlet-sirri-009-c1': (None, None), 'dovlet-sirri-013-c1': (None, None), 'dovlet-dili-006-c1': (None, None), 'remzler-004-c1': (None, None),
}


def _split_title(rest: str):
    """'Azərbaycan Respublikası Milli Məclisinin aktlarının qüvvəyə minməsi Qanunun ...' -> (title, text)."""
    if '\n' in rest[:220]:  # the extractor kept the line break between the header and the text
        title, text = rest.split('\n', 1)
        if title.strip() and text.strip():
            return title.strip(), text.strip()
    words = rest.split(' ')
    for k, w in enumerate(words):
        if k >= 2 and (w == 'AR' or w.startswith('AR-') or re.match(r'^[IVX]{1,6}\.$', w) or re.match(r'^\d', w)
                       or (w[:1].isupper() and w.strip('«“"(') not in TITLE_WORDS)):
            return ' '.join(words[:k]).strip(), ' '.join(words[k:]).strip()
    return None, rest


def fix_structure(bundle: dict) -> dict:
    stats = {'split_articles': 0, 'numbers_moved': 0, 'titles': 0, 'repeats': 0}
    by_lesson = {}
    for c in bundle['cards']:
        by_lesson.setdefault(c['lessonId'], []).append(c)
    lessons = {l['id']: l for l in bundle['lessons']}
    for lid, cards in by_lesson.items():
        cards.sort(key=lambda c: c['order'])
        out = []
        for c in cards:
            pieces = [c]
            if c['kind'] == 'law':
                m = SCRAMBLED_HEAD.search(c['body'])
                if m:  # the header's words came out of order
                    c['body'] = c['body'].replace(m.group(0), f' Maddə {m.group(2)}. {m.group(3).strip()} {m.group(1)} ', 1)
                    TITLE_WORDS.add('§')
                parts = MERGED_ARTICLE.split(c['body'])
                if len(parts) > 1:
                    c['body'] = parts[0].strip()
                    for no, rest in zip(parts[1::2], parts[2::2]):
                        title, text = _split_title(rest)
                        if not title or not text:
                            if len(rest) > 200:  # a real text we could not split: keep it where it was
                                c['body'] += f' Maddə {no}. {rest}'
                            continue  # a bare header whose article follows on its own card: drop it
                        new = {'id': f"{c['id']}-m{no}", 'lessonId': lid, 'order': 0, 'kind': 'law',
                               'title': f'Maddə {no}. {title}', 'body': text, 'ref': f'Maddə {no}'}
                        pieces.append(new)
                        ref = f'm. {no}'
                        if ref not in lessons[lid]['refs']:
                            lessons[lid]['refs'].append(ref)
                        stats['split_articles'] += 1
            out.extend(pieces)
        # a clause number left at the end of a card belongs to the next card of the same article
        for a, b in zip(out, out[1:]):
            if a['kind'] == b['kind'] == 'law':
                m = TRAILING_NO.search(a['body'])
                if m and (b['title'].startswith(a['title'].replace(' (davamı)', '')) or b['title'].endswith('(davamı)')):
                    a['body'] = a['body'][:m.start()].rstrip()
                    b['body'] = f'{m.group(1)} {b["body"]}'
                    stats['numbers_moved'] += 1
        for k, c in enumerate(out, start=1):
            c['order'] = k
        by_lesson[lid] = out
    bundle['cards'] = [c for l in bundle['lessons'] for c in by_lesson.get(l['id'], [])]

    cards = {c['id']: c for c in bundle['cards']}
    for cid, (title, cut) in TITLE_FIX.items():
        c = cards.get(cid)
        if not c:
            continue
        if cut is None:  # the title's last part sits before the first numbered part of the text
            if re.match(r'^(?:[IVX]{1,6}|\d{1,3}(?:-\d+)?(?:\.\d+){0,3})\.\s', c['body']):
                continue  # already starts with its first part: nothing left to move
            mm = re.search(r'\s(?=(?:[IVX]{1,6}|\d{1,3}(?:-\d+)?(?:\.\d+){1,3})\.\s+\S)', c['body'])
            if not mm or len(c['body'][:mm.start()]) > 200:
                continue
            cut = c['body'][:mm.start()]
        if not c['body'].startswith(cut):
            continue
        c['body'] = c['body'][len(cut):].strip()
        head = cut.split('. ')[0].strip(' .')
        c['title'] = title or f"{c['title']} {head}"
        stats['titles'] += 1

    for c in bundle['cards']:
        for _ in range(3):
            new = REPEAT.sub(r'\1', c['body'])
            if new == c['body']:
                break
            c['body'] = new
            stats['repeats'] += 1
        c['body'] = re.sub(r'\s+KMQ\d\b', '', c['body'])
        if c['kind'] == 'qa' and c['title'].startswith('Respublikasının'):
            c['title'] = 'Azərbaycan ' + c['title']
            stats['titles'] += 1
    return stats


if __name__ == '__main__':
    sys.path.insert(0, __import__('os').path.dirname(__file__))
    from lesson2 import facts
    path = sys.argv[1]
    bundle = json.load(open(path, encoding='utf-8'))
    before = {c['id']: c['body'] for c in bundle['cards']}
    stats = fix_notes(bundle)
    stats.update(fix_structure(bundle))
    for c in bundle['cards']:  # law cards whose text changed get their key facts recomputed
        if c['kind'] == 'law' and before.get(c['id']) != c['body']:
            f = facts(c['body'])
            if f:
                c['facts'] = f
            else:
                c.pop('facts', None)
    if any(stats.values()):
        base = str(bundle.get('version', '')).split('+')[0]
        bundle['version'] = base if base.endswith('-notes') else f'{base}-notes'
    json.dump(bundle, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(stats)
