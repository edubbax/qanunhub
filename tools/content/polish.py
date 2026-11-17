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
    # Letters misread by OCR ('nı' as 'mı' or 'm', 'rı' as 'n', 'y' as 'v') and other single typos.
    'qaydalarmı': 'qaydalarını', 'qaydalarım': 'qaydalarını', 'proqramlarmı': 'proqramlarını', 'funksiyalarmı': 'funksiyalarını',
    'qeydiyyatmı': 'qeydiyyatını', 'hüquqpozmalarım': 'hüquqpozmalarını', 'qarşısım': 'qarşısını', 'qurumlan': 'qurumları',
    'ehtiyatlan': 'ehtiyatları', 'informasiyalan': 'informasiyaları', 'blanklan': 'blankları', 'hallan': 'halları',
    'adlan': 'adları', 'qəran': 'qərarı', 'müəyvən': 'müəyyən', 'uvğun': 'uyğun', 'verli': 'yerli', 'verinə': 'yerinə',
    'venidən': 'yenidən', 'sovadı': 'soyadı', 'qevri': 'qeyri', 'kifavət': 'kifayət', 'hansl': 'hansı', 'sonar': 'sonra',
    'beynəlxlaq': 'beynəlxalq', 'ştruktur': 'struktur', 'olunmış': 'olunmuş', 'ictimal': 'ictimai', 'edildildə': 'edildikdə',
    'bocludur': 'borcludur', 'olunuğu': 'olunduğu', 'məauliyyətə': 'məsuliyyətə', 'apellyasia': 'apellyasiya',
    'fövqaladə': 'fövqəladə', 'müxtələf': 'müxtəlif', 'prosesual': 'prosessual', 'çıxdığə': 'çıxdığı', 'lcraçının': 'icraçının',
    'hakimiyətinin': 'hakimiyyətinin', 'təhlükəsiziliyinin': 'təhlükəsizliyinin', 'nüməyəndənin': 'nümayəndənin',
    'vsait': 'vəsait', 'səniddir': 'sənəddir', 'geçmiş': 'keçmiş', 'fəaliyyə': 'fəaliyyət', 'organ': 'orqan',
    'leyhinə': 'əleyhinə',
}
WORD_FIX_RE = re.compile(r'\b(' + '|'.join(WORD_FIXES) + r')\b', re.I)


# Chapter and section headings of the source files that ended up at the end of an option.
HEADING_TAIL = re.compile(r'\s+(?:Üçüncü bölmə\.\s*)?(?:[IVXL]+\s+(?:fəsil|FƏSIL|FƏSİL)\b|(?:İkinci|Üçüncü|Dördüncü|Beşinci|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ)\s+(?:BÖLMƏ|bölmə)\b).*$')
HYPHEN = re.compile(r'\b([A-ZƏÖÜĞÇŞİa-zəöüğçşıi][a-zəöüğçşıi]*)-\s?([a-zəöüğçşıi]+)\b')


def fix_quotes(text: str) -> str:
    """Quotes and spacing of the question texts: '”Hakimliyə”maddəsi' -> '“Hakimliyə” maddəsi',
    'Torpaq,xüsusi' -> 'Torpaq, xüsusi', 'bağlanılır.Heç' -> 'bağlanılır. Heç', '( Tam' -> '(Tam', 'edin :' -> 'edin:'."""
    text = re.sub(r'(^|[\s(])”(?=\S)', r'\1“', text)
    # A case ending after a quoted title stays attached: 'Qanun”a əsasən', 'Təlimat”ın'.
    text = re.sub(r'” (a|ə|na|nə|da|də|dan|dən|un|ün|ın|in|nun|nün|nın|nin|ya|yə|nda|ndə|ndan|ndən|la|lə)(?=[\s,.;:])', r'”\1', text)
    text = re.sub(r'”(?=[A-Za-zƏəÖöÜüĞğÇçŞşİı])(?!(?:a|ə|na|nə|da|də|dan|dən|un|ün|ın|in|nun|nün|nın|nin|ya|yə|nda|ndə|ndan|ndən|la|lə)(?=[\s,.;:]))', '” ', text)
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


# Page furniture of the source PDFs that ends up glued to the last option: '... bilər. də', '... zləyin: Sual Cavab', '... edir. 5'.
TAIL_JUNK = re.compile(r'(?:\s+(?:ə r )?(?:rdə|də|i|ə|n i|n))?(?:\s+zləyin:?)?(?:\s+Sual Cavab)*$')
PAGE_NO = re.compile(r'(?<=[.;:])\s+\d$')


def strip_tail_junk(t: str) -> str:
    t = TAIL_JUNK.sub('', t.rstrip())
    # In a list of statement numbers only a number after a bare space is a page number ('1, 3, 4 4').
    return re.sub(r'(?<=\d)\s+\d$', '', t) if re.fullmatch(r'[\d\s.,]+', t) else PAGE_NO.sub('', t)


CAP_SPLIT = re.compile(r'(?<![\w])([ÖÜ]) (?=[a-zəöüğçşı])')
# The source font also breaks words right after ö/ü: 'Dö vlət', 'mü hafizə', 'həqiqəti ü zə', 'Gömrü k'.
UMLAUT_SPLIT = re.compile(r'(?<![\w])([A-Za-zƏəÖöÜüĞğÇçŞşİı]*[öüÖÜ]) ([a-zəöüğçşı]+)')


# Words broken by the source font that are too rare in the bundle for the vocabulary check above.
SPLIT_FIXES = [
    ('ö ldü rü lməsi', 'öldürülməsi'), ('gö rdü rmək', 'gördürmək'), ('ü zə çıxar', 'üzə çıxar'), ('hö kmə', 'hökmə'),
    ('gü dən', 'güdən'), ('gü man', 'güman'), ('ö zəyi', 'özəyi'), ('bütövlüyü nü ', 'bütövlüyünü '), ('ö vdətnamə', 'övdətnamə'),
    ('düzgünlüyü nü ', 'düzgünlüyünü '), ('mü d-dətinin', 'müddətinin'), ('Məhkəmə-Hü quq', 'Məhkəmə-Hüquq'),
    ('bütövlüyünü n ', 'bütövlüyünün '), ('hökmü nə ', 'hökmünə '), ('mü hü mlü k', 'mühümlük'), ('bö lü şmə', 'bölüşmə'),
    ('lü ğ ət', 'lüğət'), ('Bü tü n', 'Bütün'), ('bü tü n', 'bütün'), ('Bö yü k', 'Böyük'), ('Düzgünlü yü n', 'Düzgünlüyün'),
    ('Gömrü k', 'Gömrük'), ('yerli ü zü nü idarə', 'yerli özünüidarə'), ('ü mumbəşəri', 'ümumbəşəri'), ('Ü mumbəşəri', 'Ümumbəşəri'),
    ('124cü', '124-cü'), ('63cü', '63-cü'), ('sü rü lmüş', 'sürülmüş'), ('idarəetmənin bö lü məsi', 'idarəetmənin bölünməsi'),
    ('hö kü mətdir', 'hökumətdir'), ('bü dcə', 'büdcə'), ('hü -ququ', 'hüququ'), ('üzvlü -yü ndə', 'üzvlüyündə'),
    ('gö s-tərilən', 'göstərilən'), ('Düzgünlüyü n ', 'Düzgünlüyün '), ('dü zü n:', 'düzün:'),
    (' 94 cü ', ' 94-cü '), ('Mü lkiProsessual', 'Mülki Prosessual'), ('Mü lki', 'Mülki'),
]


def fix_known_splits(text: str) -> str:
    for old, new in SPLIT_FIXES:
        text = text.replace(old, new)
    return text


# The source PDFs carry the author's notes inside the law text: who the "competent executive body" is in practice
# ('müvafiq icra hakimiyyəti orqanı (Nazirlər Kabineti)') and memory codes ('(MATE)', 'KOLLİZİYA'). The notes are
# kept, because they help, but marked so a learner never reads them as words of the law; the codes are dropped.
NOTE_BODIES = (r'Prezident|Nazirlər Kabineti|Nazrilər Kabineti|DİM|Dil komissiyası|Qurum|Nazirliyi|Apellyasiya Şurası'
               r'|Mərkəzi Seçki Komissiyası|İşlər İdarəsi')
NOTE_AFTER = re.compile(r'(?P<pre>(?:orqanı|orqanının|orqanları|orqanlarının|orqan|qurum|\(qurum\)|\(qurumun\)|komissiya|tərəfindən) )'
                        r'\((?!qurum\)|qurumun\))(?P<note>[^()]{2,120}?)\)')
MEMORY_CODES = [(re.compile(r'\((Dil komissiyası ilə razılaşdırılmaqla Na(?:zir|zri)lər Kabineti tərəfindən)\)'), r'[izah: \1]'),
                (re.compile(r'\s*\((?:MATE|HOT|@)\)'), ''), (re.compile(r'\s*KOLLİZİYA\b'), ''),
                (re.compile(r'\s*Viza – SAİT Qrif \(Razılaşdırma, Təsdiqetmə\) – Vəsait İmza – VSAİ Surət qeydi – Vəsait\+M'), '')]


def mark_annotations(text: str) -> str:
    def note(m: re.Match) -> str:
        n = m.group('note')
        return m.group('pre') + (f'[izah: {n}]' if re.search(NOTE_BODIES, n) and not re.search(r'\d', n) else f'({n})')
    for _ in range(3):  # notes can follow each other: 'orqan (qurum) (Nazirlər Kabineti)'
        text = NOTE_AFTER.sub(note, text)
    for rx, rep in MEMORY_CODES:
        text = rx.sub(rep, text)
    return text


WORD_TOKEN = re.compile(r'[A-Za-zƏəÖöÜüĞğÇçŞşİı]+|[^A-Za-zƏəÖöÜüĞğÇçŞşİı]+')
FRAGMENT_END = re.compile(r'[öüÖÜğ]$')


def join_umlaut_splits(text: str, vocab: Counter) -> str:
    """Joins a word the font broke into 2-4 pieces after ö/ü/ğ ('Bü tü n', 'ö ldü rü lməsi', 'lü ğ ətlər') when the
    whole word is common in the bundle and at least one piece is not a word of its own."""
    parts = WORD_TOKEN.findall(text)
    out: list = []
    i = 0
    while i < len(parts):
        done = False
        if FRAGMENT_END.search(parts[i]) and (i == 0 or not parts[i - 1][-1:].isalpha()):
            for k in (4, 3, 2):
                end = i + 2 * (k - 1)
                if end >= len(parts):
                    continue
                words = parts[i:end + 1:2]
                gaps = parts[i + 1:end:2]
                if any(g != ' ' for g in gaps) or any(not FRAGMENT_END.search(w) and len(w) > 2 for w in words[:-1]):
                    continue
                joined = ''.join(words)
                n = vocab[low(joined)]
                if n >= 3 and n >= min(vocab[low(w)] for w in words):
                    out.append(joined)
                    i = end + 1
                    done = True
                    break
        if not done:
            out.append(parts[i])
            i += 1
    return ''.join(out)
QWORD = re.compile(r'\b(hansı\w*|nə\w*|neçə\w*|necə\w*|kim\w*|hara\w*|niyə)\b', re.I)
PREDICATE = re.compile(r'\s(aid deyil(?:dir)?|aiddir|doğru deyil(?:dir)?|yanlışdır|səhvdir|daxildir|daxil deyil)\?$')


# Words that start the original question but follow the joined column header ('... uyğun olaraq Qanunvericilik təşəbbüsü').
MID_CAPS = re.compile(r'((?:uyğun olaraq|əsasən) )(Qanunvericilik|Bələdiyyələr\w*|Qanunla|Qanunlar|Hakimlərin|Bu|İcra|Məhkəmələrdə'
                      r'|Göstərilən|Tətil|Sosial|Sərbəst|Akta|Məhkəmə(?= hakimiyyəti)|Dövlət(?= ehtiyacları))\b')


def fix_question_stem(it: dict) -> None:
    """Test books often drop the question word ('Prezidentin səlahiyyətlərinə aid deyil?'); puts 'hansı' back."""
    s = it['stem'] = MID_CAPS.sub(lambda m: m.group(1) + low(m.group(2)[0]) + m.group(2)[1:], it['stem'])
    if not s.endswith('?') or QWORD.search(s) or re.search(r'm[iıuü](?:d[iıuü]r)?\?$', s) or re.search(r'\.{3,}|_{3,}|…', s):
        return
    out = re.sub(r'\bbu adda (bölmə|fəsil|maddə|maddələr) yoxdur\?$', r'hansı adda \1 yoxdur?', s)
    if out == s:
        out = re.sub(r'(\w+(?:dən|dan)) biri ', r'\1 hansı ', s, count=1)
    if out == s:
        many = all(re.fullmatch(r'\d+(?:\s*[,-]\s*\d+)+', o.strip()) for o in it['options'])
        out = PREDICATE.sub(lambda m: f" {'hansılar' if many else 'hansı'} {m.group(1)}?", s)
    if out == s:
        out = re.sub(r'\s(müəyyən edin|seçin|göstərin)\?$', r' \1.', s)
    it['stem'] = out


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


INLINE_ARTICLE = re.compile(r'\n(?=Maddə \d+(?:-\d+)?\.)')


def _article_no(title: str) -> str | None:
    m = re.match(r'Maddə (\d+(?:-\d+)?)\.', title or '')
    return m.group(1) if m else None


def fix_continuation_titles(cards: list) -> None:
    """A law card can end with the start of the next article ('...\\nMaddə 127. ...'); the cards that continue it must
    be titled after that article, not after the one the first card started with."""
    by_lesson: dict = {}
    for c in cards:
        if c['kind'] == 'law':
            by_lesson.setdefault(c['lessonId'], []).append(c)
    for cs in by_lesson.values():
        current = None
        for c in sorted(cs, key=lambda x: x['order']):
            # A card that opens with an article heading is that article's card: the heading becomes its title.
            lead = re.match(r'(Maddə \d+(?:-\d+)?\.[^\n]*)\n', c['body'])
            if lead:
                c['title'] = lead.group(1).strip()
                c['body'] = c['body'][lead.end():].lstrip()
            title = c.get('title') or ''
            if title.endswith('(davamı)') and current and _article_no(title) != _article_no(current):
                c['title'] = f'{current} (davamı)'
            elif title and not title.endswith('(davamı)'):
                current = title
            heads = re.findall(r'(?:^|\n)(Maddə \d+(?:-\d+)?\.[^\n]*|KEÇİD MÜDDƏALARI)(?=\n|$)', c['body'])
            if heads:
                current = 'Keçid müddəaları' if heads[-1] == 'KEÇİD MÜDDƏALARI' else heads[-1].strip()


def _stems(text: str) -> set:
    return {low(w)[:5] for w in re.findall(r'[A-Za-zƏəÖöÜüĞğÇçŞşİı]{5,}', text)}


def _excerpt(text: str, probe: str, limit: int = 320) -> str:
    """The clause itself if short, else the sentence that shares most words with the question, with its neighbours."""
    text = text.strip()
    if len(text) <= limit:
        return text
    parts = re.split(r'(?<=[.;])\s+', text)
    want = _stems(probe)
    best = max(range(len(parts)), key=lambda k: (len(_stems(parts[k]) & want), -k))
    lo = hi = best
    while True:
        grown = False
        if hi + 1 < len(parts) and len(' '.join(parts[lo:hi + 2])) <= limit:
            hi += 1
            grown = True
        if lo > 0 and len(' '.join(parts[lo - 1:hi + 1])) <= limit:
            lo -= 1
            grown = True
        if not grown:
            break
    out = ' '.join(parts[lo:hi + 1])
    if len(out) > limit:
        out = out[:limit].rsplit(' ', 1)[0]
        hi = -1
    return ('… ' if lo > 0 else '') + out + (' …' if hi != len(parts) - 1 else '')


def clause_quote(article: str, ref: str) -> str | None:
    """The text of one clause of an article: '3.0.3', '13.2' (with its sub-clauses), '3.III' (a Constitution part),
    '46.4' (part 4 of a Code article numbered '1.', '2.' ...), '70 (e)' (a lettered item) or '6' (the article's start)."""
    r = ref.strip()
    if m := re.fullmatch(r'(\d+(?:-\d+)?)\.([IVX]+)', r):
        found = re.search(r'(?:^|\s)' + m.group(2) + r'\.\s(.+?)(?=\s[IVX]+\.\s|$)', article)
        return found.group(1) if found else None
    if m := re.fullmatch(r'(\d+(?:-\d+)?)((?:\.\d+)+)', r):
        label = r + '.'
        start = re.search(r'(?<![\d.\-])' + re.escape(label) + r'\s', article)
        if start:
            end = len(article)
            for nxt in re.finditer(r'\s(\d+(?:-\d+)?(?:\.\d+)+)\.\s', article[start.end():]):
                if not (nxt.group(1) + '.').startswith(label):
                    end = start.end() + nxt.start()
                    break
            return article[start.end():end]
        if not re.search(r'(?<![\d.\-])' + re.escape(m.group(1)) + r'\.\d', article):  # parts numbered '1.', '2.'
            part = m.group(2).rsplit('.', 1)[1]
            found = re.search(r'(?:^|\s)' + part + r'\.\s(.+?)(?=\s\d+(?:-\d+)?\.\s|$)', article)
            return found.group(1) if found else None
        return None
    if m := re.fullmatch(r'(\d+(?:-\d+)?)\s*\(([a-zçğşəıöü])\)', r):
        found = re.search(r'(?:^|\s)' + m.group(2) + r'\)\s(.+?)(?=\s[a-zçğşəıöü]\)\s|$)', article)
        return found.group(1) if found else None
    if re.fullmatch(r'\d+(?:-\d+)?', r):
        return article
    return None


def quote_thin_explanations(bundle: dict) -> None:
    """Formative questions whose explanation is only a reference ('Maddə 3.0.3.') get the quoted clause from the law."""
    articles: dict = {}
    for c in bundle['cards']:
        if c['kind'] != 'law' or not (no := _article_no(c.get('title'))):
            continue
        topic = c['lessonId'].rsplit('-', 1)[0]
        for k, seg in enumerate(INLINE_ARTICLE.split(c['body'])):
            if k:  # a segment that starts with its own article heading
                head, _, seg = seg.partition('\n')
                no = _article_no(head)
            articles[(topic, no)] = (articles.get((topic, no), '') + ' ' + seg).strip()
    for it in bundle['items']:
        expl = (it.get('explanation') or '').strip()
        if it.get('pool') != 'formative' or len(expl) >= 60 or re.search(r'«[^»]{25,}»', expl):
            continue
        ref = (it.get('ref') or '').removeprefix('m.').strip()
        art = re.match(r'\d+(?:-\d+)?', ref)
        text = art and articles.get((it['topicId'], art.group(0)))
        quote = text and clause_quote(text, ref)
        if not quote or len(quote) < 15:
            continue
        # The clause must be about the question; a wrong article part is worse than no quote.
        probe = it['stem'] + ' ' + ' '.join(it['options'][a] for a in it['answer'])
        if len(_stems(quote) & _stems(probe)) < min(2, len(_stems(probe))):
            continue
        quote = _excerpt(quote.rstrip(' ;'), probe)
        if re.fullmatch(r'Maddə [\d\-]+(?:\.\d+|\.[IVX]+)*\.?|Maddə \d+(?:-\d+)?, [\d.\-]+-[a-zıüö]+ hissə\.', expl):
            it['explanation'] = f"{expl.rstrip('.')}: «{quote}»"
        else:
            it['explanation'] = f'{expl} Qanun: «{quote}»'


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
        c['body'] = fix_known_splits(join_umlaut_splits(CAP_SPLIT.sub(r'\1', c['body']), vocab))
        if c.get('title'):
            c['title'] = join_umlaut_splits(c['title'], vocab)
        body = fix_splits(c['body'], vocab)
        c['body'] = clean_law(body) if c['kind'] == 'law' else PRIVATE.sub('\n', body).strip()
        if c.get('title'):
            c['title'] = fix_splits(c['title'], vocab)
    for i in bundle['items']:
        # The PDF font splits words after Ö and Ü: 'Ö z', 'Ü mumi'.
        i['stem'] = fix_known_splits(join_umlaut_splits(CAP_SPLIT.sub(r'\1', i['stem']), vocab))
        i['options'] = [fix_known_splits(join_umlaut_splits(CAP_SPLIT.sub(r'\1', o), vocab)) for o in i['options']]
        if i.get('statements'):
            i['statements'] = [fix_known_splits(join_umlaut_splits(CAP_SPLIT.sub(r'\1', x), vocab)) for x in i['statements']]
        if i.get('explanation'):
            i['explanation'] = fix_known_splits(i['explanation'])
        if i.get('pool', 'exam') == 'exam':
            i['stem'] = strip_tail_junk(i['stem'])
            i['options'] = [strip_tail_junk(o) for o in i['options']]
            if i.get('statements'):
                i['statements'] = [strip_tail_junk(x) for x in i['statements']]
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

    for i in bundle['items']:
        fix_question_stem(i)

    problems = [f'phrase not found: {old!r}' for old, _ in phrases if old not in used]
    card_fixes = _load(os.path.join(fixes_dir, 'cards.json'))
    by_card = {c['id']: c for c in bundle['cards']}
    late: list = []
    for cid, pairs in card_fixes.items():
        if cid.startswith('_'):
            continue
        c = by_card.get(cid)
        if not c:
            problems.append(f'card {cid}: not found')
            continue
        missed: list = []
        c['body'] = _apply_replacements(c['body'], pairs, f'card {cid}', missed)
        if missed:
            late.append((c, [p for p in pairs if (p[0][2:] if p[0].startswith('>>') else p[0]) not in c['body']]))
    fix_law_layout(bundle['cards'])
    # Fixes written against the text after the layout pass (article headings rebuilt there).
    for c, pairs in late:
        c['body'] = _apply_replacements(c['body'], pairs, f"card {c['id']}", problems).strip()
    fix_continuation_titles(bundle['cards'])
    for c in bundle['cards']:
        c['body'] = fix_known_splits(c['body'])
        c['title'] = fix_known_splits(c['title'])
        if c['kind'] == 'law':
            c['body'] = mark_annotations(c['body'])
    # Recall cards whose question could not be put back together (the answer has no final period, so the wrapped
    # question's first line cannot be told apart from it) are left out rather than shown with half a question.
    bundle['cards'] = [c for c in bundle['cards'] if c['kind'] != 'qa' or (
        re.match(r'[A-ZƏÖÜÇŞĞİ“"«(0-9]', c['title']) and c['title'].rstrip().endswith('?') and not PRIVATE.search(c['title']) and '\n' not in c['title'])]
    quote_thin_explanations(bundle)
    for i in bundle['items']:
        if i.get('explanation'):
            i['explanation'] = fix_known_splits(i['explanation'])

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
