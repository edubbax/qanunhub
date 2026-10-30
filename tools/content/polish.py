"""Final clean-up of the generated bundle, then the editors' fixes.

1. Words split by the PDF fonts after ü/ö ("dö vlət", "ü çü ncü", "Ö lkəyə") are joined, using the vocabulary of
   the whole bundle to tell fragments from real words ("özü ilə" stays apart).
2. Private-use bullet characters of the summaries become line breaks.
3. Study notes the summaries add to the law text ("(Kod: BəHaNə)", "(Tərif)", "(83 qərar)") are removed from
   law cards; the article text itself is not touched.
4. content/fixes/items.json and content/fixes/cards.json hold reviewed corrections: answer keys, wording,
   unpublishing, and card text replacements. Each fix names the text it expects, so a stale fix is reported.
"""
import json
import os
import re
from collections import Counter

WORD = re.compile(r"[A-Za-zƏəÖöÜüĞğÇçŞşİıI]+")
# The left part must start a word: "3-cü kursda" is an ordinal followed by a word, not a split.
SPLIT = re.compile(r"(?<![\w-])([A-Za-zƏəÖöÜüĞğÇçŞşİıI]*[üöÜÖ]) ([a-zəöüğçşı]+)\b")
PRIVATE = re.compile(r'[ \t]*[-]+[ \t]*')
REAL_SHORT = {'ölü', 'özü', 'üçü', 'günü', 'sözü', 'növü', 'üzvü', 'ötrü', 'gözü', 'düzü', 'hü', 'ö', 'ü'}

# Notes of the summaries inside parentheses: mnemonic codes, cross references for the reader, vote hints.
NOTE_PARENS = re.compile(
    r'\s*\((?:Kod:[^()]*|Tərif|Konspekt|Səlahiyyət|Silah|Hüquq|Hər kəs|Ombudsman|TEMS|PAPAM\+NK|HH, DD, MM|'
    r'Məhkəmələr, MSK, MM|səfirlik, konsulluq|Çünki xidmətlə əlaqədardır|Bank rəhbəri dəyişdirilsə belə bank özəlləşdirilə bilməz|'
    r'MM/2\+, Prezident 1|\d+(?:-\d+)? (?:qərar|qanun)[^()]*|Vətəndaşların müraciəti haqqında qanun|Qeyd: [^()]*|MM → Konstitusiya mehkemesi|Konstitusiya mehkemesi → MM|'
    r'Təşəbbüskar[^()]*|Naxçıvanın Baş prokuroru yoxdur|1-3 bəndlərdə[^()]*|Diqqətli olun![^()]*|'
    r'Mənası:[^()]*|Diqqət:[^()]*(?:\([^()]*\)[^()]*)*)\)')


# Words that lost a letter in the source files (found by comparing rare words with frequent ones).
WORD_FIXES = {
    'müyyən': 'müəyyən', 'qnunla': 'qanunla', 'məhkməsi': 'məhkəməsi', 'keçrilir': 'keçirilir', 'tutlan': 'tutulan',
    'bilavastə': 'bilavasitə', 'məclsin': 'məclisin', 'keçrilməsini': 'keçirilməsini', 'müqvilədə': 'müqavilədə',
    'qanunverciliyə': 'qanunvericiliyə', 'ixtisaslaşdırlmış': 'ixtisaslaşdırılmış', 'müddəlardan': 'müddəalardan',
    'yalnışdır': 'yanlışdır', 'yalnış': 'yanlış',
    # Words glued together or hyphens lost in the source files.
    'könüllürazılıq': 'könüllü razılıq', 'könüllürazılığı': 'könüllü razılığı', 'könüllübağlanılır': 'könüllü bağlanılır',
    'könüllüsosial': 'könüllü sosial', 'könüllüişdən': 'könüllü işdən', 'üçüncüşəxslər': 'üçüncü şəxslər',
    'üçüncüşəxslərin': 'üçüncü şəxslərin', 'üçüncübazar': 'üçüncü bazar', 'təşkilatisərəncamverici': 'təşkilati-sərəncamverici',
    'qeyrihökumət': 'qeyri-hökumət', 'mülkihüquqi': 'mülki-hüquqi', 'bölgüsühaqqında': 'bölgüsü haqqında',
    'bölgüsühansı': 'bölgüsü hansı', 'təşkilatihüquqi': 'təşkilati-hüquqi', 'suiistifadəyə': 'sui-istifadəyə',
    'elmitexniki': 'elmi-texniki', 'milliməclisin': 'Milli Məclisin', 'milliməclis': 'Milli Məclis',
    'respublikasıkonstitusiya': 'Respublikası Konstitusiya', 'davranışqaydalarını': 'davranış qaydalarını',
    'vətəndaşlığıolan': 'vətəndaşlığı olan', 'qeyridövlət': 'qeyri-dövlət', 'yerliözünüidarə': 'yerli özünüidarə',
    'yerliözünüidarəetmə': 'yerli özünüidarəetmə', 'müdaxiləedilməsi': 'müdaxilə edilməsi', 'texnikitəşkilati': 'texniki-təşkilati',
    'vitseprezidentinin': 'vitse-prezidentinin', 'qeyrimaddi': 'qeyri-maddi', 'birbirinə': 'bir-birinə',
    # Short words typed with the wrong letters in one of the source files.
    'va': 'və', 've': 'və', 'ila': 'ilə', 'ile': 'ilə', 'aktin': 'aktın',
}
WORD_FIX_RE = re.compile(r'\b(' + '|'.join(WORD_FIXES) + r')\b', re.I)


# Chapter and section headings of the source files that ended up at the end of an option.
HEADING_TAIL = re.compile(r'\s+(?:Üçüncü bölmə\.\s*)?(?:[IVXL]+\s+(?:fəsil|FƏSIL|FƏSİL)\b|(?:İkinci|Üçüncü|Dördüncü|Beşinci|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ)\s+(?:BÖLMƏ|bölmə)\b).*$')
HYPHEN = re.compile(r'\b([A-ZƏÖÜĞÇŞİa-zəöüğçşıi][a-zəöüğçşıi]*)-\s?([a-zəöüğçşıi]+)\b')


def fix_quotes(text: str) -> str:
    """Quotes and spacing of the question texts: '”Hakimliyə”maddəsi' -> '“Hakimliyə” maddəsi',
    'Torpaq,xüsusi' -> 'Torpaq, xüsusi', 'bağlanılır.Heç' -> 'bağlanılır. Heç', '( Tam' -> '(Tam', 'edin :' -> 'edin:'."""
    text = re.sub(r'(^|[\s(])”(?=\S)', r'\1“', text)
    text = re.sub(r'”(?=[A-Za-zƏəÖöÜüĞğÇçŞşİı])', '” ', text)
    text = re.sub(r'(?<=[A-Za-zƏəÖöÜüĞğÇçŞşİı]),(?=[A-Za-zƏəÖöÜüĞğÇçŞşİı])', ', ', text)
    text = re.sub(r'(?<=[a-zəöüğçşı]{2})\.(?=[A-ZƏÖÜĞÇŞİ][a-zəöüğçşı])', '. ', text)
    text = re.sub(r'(?<=\d)\.(?=[A-ZƏÖÜĞÇŞİ][a-zəöüğçşı])', '. ', text)
    text = re.sub(r';(?=\S)', '; ', text)
    text = re.sub(r'\(\s+', '(', text)
    text = re.sub(r'\s+\)', ')', text)
    return re.sub(r'(?<=\S)\s+([,:;])', r'\1', text)


def fix_words(text: str) -> str:
    text = re.sub(r'\bvə va\b', 'və ya', text)

    def rep(m: re.Match) -> str:
        w = m.group(0)
        fixed = WORD_FIXES.get(low(w))
        if not fixed:  # re.I also matches ı for i: 'aktın' is already right
            return w
        return fixed[0].upper() + fixed[1:] if w[0].isupper() and fixed[0].islower() else fixed
    return WORD_FIX_RE.sub(rep, text)


# Single wrong letters (a/ə, ı/i, u/ü ...) are fixed when the corrected word is frequent in the bundle and the
# typed one is rare. These real words look like typos of other words and are left alone.
LETTER_SUBS = [('a', 'ə'), ('e', 'ə'), ('ı', 'i'), ('i', 'ı'), ('u', 'ü'), ('o', 'ö'), ('g', 'ğ'), ('s', 'ş'), ('c', 'ç')]
REAL_WORDS = {'həyati', 'əxlaqi', 'hərəkat', 'amal'}


def letter_fixes(vocab: Counter) -> dict:
    out = {}
    for w, n in vocab.items():
        if n > 12 or len(w) < 3 or w in REAL_WORDS:
            continue
        cands = [w[:k] + b + w[k + 1:] for a, b in LETTER_SUBS for k, ch in enumerate(w) if ch == a]
        idx = [k for k, ch in enumerate(w) if ch == 'a']
        cands += [''.join('ə' if k in (x, y) else ch for k, ch in enumerate(w)) for i, x in enumerate(idx) for y in idx[i + 1:]]
        best = max(cands, key=lambda c: vocab.get(c, 0), default=None)
        m = vocab.get(best, 0) if best else 0
        if (n <= 2 and len(w) >= 4 and m >= 5) or m >= 100 * n:
            out[w] = best
    return out


def fix_letters(text: str, fixes: dict) -> str:
    def rep(m: re.Match) -> str:
        w = m.group(0)
        f = fixes.get(low(w))
        if not f:
            return w
        return (f[0].upper() if f[0] != 'i' else 'İ') + f[1:] if w[0].isupper() else f
    return WORD.sub(rep, text) if fixes else text


def fix_hyphens(text: str, vocab: Counter) -> str:
    """'in-formasiya' -> 'informasiya': line-break hyphens left in the text, joined only into known words."""
    def rep(m: re.Match) -> str:
        j = m.group(1) + m.group(2)
        return j if vocab.get(low(j), 0) >= 3 and vocab.get(low(m.group(1)), 0) <= 2 else m.group(0)
    return HYPHEN.sub(rep, text)


def low(w: str) -> str:
    return w.replace('I', 'ı').replace('İ', 'i').lower()


def build_vocab(texts) -> Counter:
    c = Counter()
    for t in texts:
        for w in WORD.findall(t or ''):
            c[low(w)] += 1
    return c


def fix_splits(text: str, vocab: Counter) -> str:
    text = text.replace('ә', 'ə').replace('Ә', 'Ə')  # Cyrillic schwa from some source files

    def join(m: re.Match) -> str:
        left, right = m.group(1), m.group(2)
        l, r, j = low(left), low(right), low(left + right)
        if l in REAL_SHORT and len(l) > 1 and vocab.get(l, 0) > 3:
            return m.group(0)
        known = vocab.get(j, 0) >= 1 and vocab.get(r, 0) <= 2
        fragments = vocab.get(l, 0) <= 1 and vocab.get(r, 0) <= 1
        short = len(l) <= 2 and l not in ('ü', 'ö') or (len(l) == 1 and vocab.get(r, 0) <= 3)
        return left + right if known or fragments or (short and vocab.get(r, 0) <= 3) else m.group(0)

    for _ in range(4):
        nxt = SPLIT.sub(join, text)
        if nxt == text:
            break
        text = nxt
    fixes = getattr(vocab, 'letter_fixes', None)
    if fixes is None:
        fixes = vocab.letter_fixes = letter_fixes(vocab)
    return fix_letters(fix_words(fix_hyphens(text, vocab)), fixes)


KONST_HEAD = 'Azərbaycan Respublikasının Konstitusiyasına '


def fix_column_split(it: dict) -> None:
    """Two-column PDF pages tore 'uyğun olaraq Azərbaycan' out of the question and left it after the question,
    an option or a statement: 'Konstitusiyasına Respublikasının Prezidenti necə seçilir? uyğun olaraq Azərbaycan',
    'Konstitusiyasına məsuliyyətinə hansı qaydada cəlb oluna bilər? uyğun olaraq hakim cinayət'."""
    stem = it['stem']
    m = re.match(r'^Azərbaycan Respublikasının (Respublikası\w* .*?[?:])\s*Konstitusiyasına uyğun olaraq\s*(.*?)\s*$', stem)
    if m:
        stem = f'{KONST_HEAD}{m.group(1)} uyğun olaraq {m.group(2)}'.strip()
    if not stem.startswith(KONST_HEAD):
        return
    rest = stem[len(KONST_HEAD):]
    tail = re.compile(r'\s+(?:olaraq\s+)?Azərbaycan$')
    lost = False
    if re.match(r'uyğun (?:olaraq )?Respublikası\w* ', rest):
        body = re.sub(r'^uyğun (?:olaraq )?', '', rest)
        lost = not tail.search(body)
        it['stem'] = f'{KONST_HEAD}uyğun olaraq Azərbaycan {tail.sub("", body)}'
    elif not rest.startswith('uyğun'):
        m = re.match(r'(.*?[?:](?:\s*\([^)]*\))?)\s*uyğun olaraq\s*(.*?)\s*$', rest)
        if m and m.group(1).count('?') + m.group(1).count(':') == 1:
            x, y = m.group(1), m.group(2)
        elif rest.startswith('Respublikası') and 'uyğun olaraq' not in rest:
            x, y = rest, ''
        else:
            return
        if x.startswith('Respublikası') and not y.endswith('Azərbaycan'):
            y = f'{y} Azərbaycan'.strip()
            lost = True
        it['stem'] = f'{KONST_HEAD}uyğun olaraq {y} {x}'
    else:
        return
    # The torn words that ended up after an option or a statement.
    junk = re.compile(r'\s+(?:uyğun olaraq Azərbaycan|uyğun olaraq|olaraq Azərbaycan|Azərbaycan)$')
    for key in ('options', 'statements'):
        for n, t in enumerate(it.get(key) or []):
            if re.search(r'\s(?:uyğun olaraq|olaraq Azərbaycan|Azərbaycan)$', t) and (lost or t.endswith('uyğun olaraq')):
                it[key][n] = junk.sub('', t)


NUMERIC_OPTION = re.compile(r'^[\d\s,.\-a-e]+$')


def split_inline_statements(it: dict) -> None:
    """'... bilməz? 1 dövlət 2 paylı 3 bələdiyyə 4 birgə 5 Xüsusi' with options '1,3,5' -> numbered statements.
    Only when every option is a list of statement numbers and the numbers run 1, 2, 3 ... in order."""
    if it.get('statements') or not all(NUMERIC_OPTION.match(o) for o in it['options']):
        return
    stem = it['stem']
    cuts = []
    pos = 0
    for n in range(1, 13):
        m = re.compile(rf'(?:^|\s){n}(?:[.)]\s*|\s+)(?=[A-Za-zƏəÖöÜüĞğÇçŞşİı“"])').search(stem, pos)
        if not m:
            break
        cuts.append(m)
        pos = m.end()
    if len(cuts) < 3:
        return
    head = stem[:cuts[0].start()].strip()
    parts = [stem[a.end():(b.start() if b else len(stem))].strip(' ;,') for a, b in zip(cuts, cuts[1:] + [None])]
    if not head or head[-1] not in '?:.)' or any(not p for p in parts):
        return
    it['stem'] = head
    it['statements'] = [p[0].upper() + p[1:] for p in parts]


def split_glued_options(it: dict) -> None:
    """'Açıq, müstəsna hallarda qapalı C)Heç biri' held two options in one."""
    if len(it['options']) != 3:
        return
    m = re.search(r'\s+[A-E]\)\s*(\S.*)$', it['options'][-1])
    if m:
        it['options'][-1] = it['options'][-1][:m.start()].strip()
        it['options'].append(m.group(1).strip())


def clean_law(text: str) -> str:
    text = PRIVATE.sub('\n', text)
    text = re.sub(r'\s-\s?\d{1,3}\s?-(?=\s)', '', text)  # page numbers of the source PDF: '-5-', '- 13 -'
    text = NOTE_PARENS.sub('', text)
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n{2,}', '\n', text)
    return text.strip()


TITLE_TAIL = re.compile(r"^((?:[a-zəöüğçşı][\w()-]*,?\s+)+?)(?=[A-ZƏÖÜĞÇŞİ(]|[IVX]+\.\s|\d+(?:[.-]\d+)*\.)")
SPACED_ARTICLE = re.compile(r'\s*Maddə\s+((?:\d\s+){1,3}\d?)\s*\.\s*')


def fix_law_layout(cards: list) -> None:
    """Headings of the next article with spaced digits ('Maddə 1 0 . ...') start a new line, and the end of an
    article title that wrapped into the body ('Maddə 67. ... şəxslərin' + 'hüquqları I. ...') returns to the title."""
    moved = {}
    for c in cards:
        if c['kind'] != 'law':
            continue
        c['body'] = SPACED_ARTICLE.sub(lambda m: '\nMaddə ' + re.sub(r'\s+', '', m.group(1)) + '. ', c['body']).strip()
        title = c.get('title') or ''
        if title.endswith('(davamı)'):
            base = title[:-len('(davamı)')].rstrip()
            if (c['lessonId'], base) in moved:
                c['title'] = moved[(c['lessonId'], base)] + ' (davamı)'
            continue
        m = TITLE_TAIL.match(c['body'])
        if not m or not title.startswith('Maddə') or len(m.group(1)) > 80:
            continue
        tail = m.group(1).strip().rstrip(',')
        new_title = f'{title} {tail}'
        moved[(c['lessonId'], title)] = new_title
        c['title'] = new_title
        c['body'] = c['body'][m.end():].lstrip()


def _apply_replacements(text: str, pairs, where: str, problems: list) -> str:
    """Exact replacements; an old text starting with '>>' cuts the card from that text to its end."""
    for old, new in pairs:
        if old.startswith('>>'):
            at = text.find(old[2:])
            if at < 0:
                problems.append(f'{where}: text not found: {old[2:62]!r}')
                continue
            text = text[:at].rstrip() + new
            continue
        if old not in text:
            problems.append(f'{where}: text not found: {old[:60]!r}')
            continue
        text = text.replace(old, new, 1)
    return text


def polish(bundle: dict, fixes_dir: str) -> list:
    """Cleans the bundle in place and applies reviewed fixes. Returns the list of problems with stale fixes."""
    texts = []
    for c in bundle['cards']:
        texts += [c['body'], c.get('title') or '']
    for i in bundle['items']:
        texts += [i['stem'], i.get('explanation') or ''] + i['options'] + (i.get('statements') or [])
    vocab = build_vocab(texts)

    for c in bundle['cards']:
        body = fix_splits(c['body'], vocab)
        c['body'] = clean_law(body) if c['kind'] == 'law' else PRIVATE.sub('\n', body).strip()
        if c.get('title'):
            c['title'] = fix_splits(c['title'], vocab)
    for i in bundle['items']:
        i['stem'] = fix_quotes(fix_splits(PRIVATE.sub(' ', i['stem']), vocab)).strip()
        i['options'] = [fix_quotes(HEADING_TAIL.sub('', fix_splits(PRIVATE.sub(' ', o), vocab))).strip() for o in i['options']]
        if i.get('statements'):
            i['statements'] = [fix_quotes(fix_splits(PRIVATE.sub(' ', s), vocab)).strip() for s in i['statements']]
        if i.get('explanation'):
            i['explanation'] = fix_splits(i['explanation'], vocab)
        fix_column_split(i)
        split_glued_options(i)
        split_inline_statements(i)
        # '1.2.5' and '1,2,3.4,5' are lists of statement numbers.
        i['options'] = [o.replace('.', ',') if re.fullmatch(r'\d+(?:\s*[.,]\s*\d+)+', o) else o for o in i['options']]

    phrases = _load(os.path.join(fixes_dir, 'phrases.json')).get('replace', [])
    used = set()
    for i in bundle['items']:
        for old, new in phrases:
            def sub(t: str) -> str:
                if old in t:
                    used.add(old)
                    return t.replace(old, new)
                return t
            i['stem'] = sub(i['stem'])
            i['options'] = [sub(o) for o in i['options']]
            if i.get('statements'):
                i['statements'] = [sub(x) for x in i['statements']]

    problems = [f'phrase not found: {old!r}' for old, _ in phrases if old not in used]
    card_fixes = _load(os.path.join(fixes_dir, 'cards.json'))
    by_card = {c['id']: c for c in bundle['cards']}
    for cid, pairs in card_fixes.items():
        if cid.startswith('_'):
            continue
        c = by_card.get(cid)
        if not c:
            problems.append(f'card {cid}: not found')
            continue
        c['body'] = _apply_replacements(c['body'], pairs, f'card {cid}', problems)
    fix_law_layout(bundle['cards'])

    item_fixes = _load(os.path.join(fixes_dir, 'items.json'))
    by_item = {i['id']: i for i in bundle['items']}
    by_unit: dict = {}
    for i in bundle['items']:
        by_unit.setdefault(i['unitId'], []).append(i)
    for iid, fx in item_fixes.items():
        if iid.startswith('_'):
            continue
        it = by_item.get(iid)
        if not it:
            problems.append(f'item {iid}: not found')
            continue
        before = list(it['options'])
        _fix_item(it, fx, iid, problems)
        # Variants of the same question from other source files get the same correction.
        for sib in by_unit.get(it['unitId'], []):
            if sib is it or sib['id'] in item_fixes:
                continue
            if sib['options'] == before:
                _fix_item(sib, fx, sib['id'], problems)
                continue
            if 'answer' in fx:
                want = [_norm(it['options'][a]) for a in it['answer']]
                got = [n for n, o in enumerate(sib['options']) if _norm(o) in want]
                if len(got) == len(want):
                    _fix_item(sib, {'answer': got, 'publish': fx.get('publish')}, sib['id'], problems)
                else:
                    problems.append(f'item {sib["id"]}: variant of {iid} differs, review it too')
            if fx.get('draft'):
                _fix_item(sib, {'draft': True}, sib['id'], problems)
    return problems


def _norm(t: str) -> str:
    """Option text for matching variants: 'AR-da' and 'Azərbaycan Respublikasında' compare equal."""
    t = re.sub(r'Azərbaycan Respublikası(nın|na|nda|ndan|nı)?', r'AR\1', t).replace('AR-', 'AR')
    return re.sub(r'[\s.;,]+', '', t).lower()


def _fix_item(it: dict, fx: dict, iid: str, problems: list) -> None:
    """Applies one reviewed fix: key check, text overrides and replacements, answer, publish or draft."""
    for key in ('stem', 'options', 'statements', 'explanation', 'ref'):
        if key in fx:
            it[key] = fx[key]
    if 'options' in fx:
        it['flags'] = [f for f in it['flags'] if f != 'dup_options']
    for old, new in fx.get('replace', []):
        done = False
        if old in it['stem']:
            it['stem'] = it['stem'].replace(old, new, 1)
            done = True
        for key in ('options', 'statements'):
            for n, o in enumerate(it.get(key) or []):
                if not done and old in o:
                    it[key][n] = o.replace(old, new, 1)
                    done = True
        if not done:
            problems.append(f'item {iid}: text not found: {old[:60]!r}')
    if 'answer' in fx:
        it['answer'] = fx['answer']
        it['flags'] = [f for f in it['flags'] if f not in ('no_key', 'key_conflict')]
        if fx.get('publish'):
            it['status'] = 'published'
    if fx.get('draft'):
        it['status'] = 'draft'
        it['flags'] = sorted(set(it['flags']) | {'reviewed_out'})
    if 'expect' in fx and _norm(it['options'][it['answer'][0]]) != _norm(fx['expect']):
        problems.append(f'item {iid}: expected key {fx["expect"]!r}, found {it["options"][it["answer"][0]]!r}')


def _load(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf-8') as f:
        return json.load(f)
