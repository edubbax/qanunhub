"""Text cleanup for pdftotext output of the course PDFs.

Two problems need fixing before parsing:
  * branding lines (page headers/footers, contact lines, promo pages) repeated on every page;
  * a font quirk that inserts a space after ö/ü/ğ ("dö vlət", "bü tü n", "Aşağ ıdakı").
The second is fixed with a vocabulary built from the whole corpus: fragments are joined only when
the joined word occurs elsewhere in the corpus as a whole word.
"""
import re
import unicodedata
from collections import Counter

BRAND_LINE = re.compile(
    r'^(Shamkhal Shikhaliev(\s+\d+)?|“?Dövlət Orqanlarına Hazırlıq”? Tədris Portalı|'
    r'Bizi Sosial şəbəkələrdə izləyin.*|Əlaqə:.*shamkhalshikhaliev.*|.*shamkhalshikhaliev@gmail\.com.*|'
    r'Law Civil Service Online.*|#Qanunvericilik.*|Dövlət Orqanlarına Hazırlıq Proqramı|Qanunvericilik fənni üzrə.*|'
    r'Self-study \|.*|.*Tədris Portalı)$'
)

PROMO_START = re.compile(
    r'^(Siz də bizim dərslərə qoşularaq|Self-Study paketi|Fəaliyyət istiqamətlərimiz|.*Sosial şəbəkələrimizə keçid|'
    r'➢ İnstagram|İnstagram səhifəmiz|Facebook qrupumuz|YouTube kanalımız|TikTok səhifəmiz|Telegram qrupumuz|WhatsApp qrupumuz)'
)

SPECIAL = 'öüğÖÜĞ'
WORD = re.compile(r"[A-Za-zƏəÖöÜüĞğÇçŞşİıI]+")


def _between_headers(lines, header, i):
    """True for the page number printed between the two page-header lines."""
    def near(rng):
        for j in rng:
            if 0 <= j < len(lines):
                if header[j]:
                    return True
                if lines[j].strip():
                    return False
        return False
    return near(range(i - 1, i - 4, -1)) and near(range(i + 1, i + 4))


BRAND_FRAGMENTS = re.compile(
    r'Bizi Sosial şəbəkələrdə( izləyin:?)?|#Qanunvericilik_Dovlet_Qullugu|Əlaqə:\s*(\+994 \(51\)|\(51/99\))? ?337 37 75 ?/?|'
    r'#[\w.]+|Bizi Sosial şəbək\w*( iz\w*:?)?|\+994 \(51\)[\s\d]*|\(51/99\)[\s\d]*|\bləyin:|shamkhalshikhaliev@gmail\.com|\(51/99\) 337 37 75|\+994 \(51\) 337 37 75|Shamkhal Shikhaliev|“Dövlət Orqanlarına Hazırlıq” Tədris Portalı|Əlaqə:|izləyin:'
)


def strip_branding(text: str) -> str:
    lines = text.replace('\f', '\n').split('\n')
    header = [bool(BRAND_LINE.match(l.strip())) for l in lines]
    out = []
    for i, line in enumerate(lines):
        s = line.strip()
        if header[i] or PROMO_START.match(s):
            continue
        # A lone number next to a page header is a page number; elsewhere it may belong to an answer-key table.
        if re.fullmatch(r'\d{1,3}', s) and _between_headers(lines, header, i):
            continue
        if re.match(r'^\+?994|^\(51/99\)|^https?://|^(Dövlət qulluğu|Xarici İşlər|Vergi) \|', s):
            continue
        out.append(BRAND_FRAGMENTS.sub('', line).rstrip())
    return '\n'.join(out)


PROMO_MARKERS = ('Siz də bizim dərslərə qoşularaq', 'istəyirsinizsə qeyd olunan', 'Self-Study paketi', 'üçün tərtib olunub.',
                 'Direktorların işə qəbulu', 'Müsahibəyə hazırlaşırsan', 'SƏN FƏRQLİ OLA BİLƏRSƏN')


def cut_promo_tail(text: str) -> str:
    """Drops the advertising pages appended at the end of most files."""
    cut = len(text)
    for marker in PROMO_MARKERS:
        i = text.find(marker, int(len(text) * 0.5))
        if i != -1:
            cut = min(cut, i)
    return text[:cut]


def build_vocab(texts) -> Counter:
    c = Counter()
    for t in texts:
        for w in WORD.findall(t):
            c[w.lower()] += 1
    return c


def az_lower(w: str) -> str:
    return w.replace('I', 'ı').replace('İ', 'i').lower()


REAL_SHORT = {'ağ', 'bağ', 'dağ', 'sağ', 'çağ', 'yağ', 'özü', 'üçü', 'ölü', 'günü', 'sözü', 'növü', 'üzvü', 'ötrü', 'gözü', 'düzü'}


def fix_split_words(text: str, vocab: Counter) -> str:
    """Joins 'dö vlət' -> 'dövlət' and 'bü tü n' -> 'bütün' (font quirk: a space after ö/ü/ğ).

    A join is accepted when the joined word occurs in the corpus, or when the left part is a short
    non-word fragment and the joined word shares a 6-letter prefix with known words.
    """
    prefixes = Counter()
    for w, c in vocab.items():
        if len(w) >= 6:
            prefixes[w[:6]] += 1

    def clean(w: str) -> str:
        return re.sub(r'^[^\w]+|[^\w]+$', '', w)

    def fix_line(line: str) -> str:
        words = line.split(' ')
        out = []
        i = 0
        while i < len(words):
            best_k = 0
            joined = words[i]
            frag = az_lower(clean(words[i]))
            for k in range(1, 4):
                if i + k >= len(words) or not joined or joined[-1] not in SPECIAL or '-' in words[i]:
                    break
                nxt = words[i + k]
                if not nxt or not nxt[0].islower():
                    break
                joined += nxt
                core = az_lower(clean(joined))
                if core and vocab.get(core, 0) >= 2:
                    best_k = k
                elif (len(frag) <= 4 and frag not in REAL_SHORT and len(core) >= 6
                      and prefixes.get(core[:6], 0) >= 2):
                    best_k = k
            out.append(''.join(words[i:i + best_k + 1]))
            i += best_k + 1
        return ' '.join(out)

    return '\n'.join(fix_line(l) for l in text.split('\n'))


def normalize_spaces(s: str) -> str:
    s = unicodedata.normalize('NFC', s)
    s = s.replace(' ', ' ').replace('​', '')
    s = re.sub(r'[ \t]+', ' ', s)
    return s.strip()


def join_lines(lines) -> str:
    """Joins wrapped lines into a paragraph, keeping list items on their own lines."""
    out = ''
    for l in lines:
        l = l.strip()
        if not l:
            continue
        if not out:
            out = l
        elif re.match(r'^(\d+(\.\d+)*[.)]|[a-zəıöüğçş]\)|[-–•]|[IVX]+\.)\s', l):
            out += '\n' + l
        elif out.endswith('-') and not out.endswith(' -'):
            out = out[:-1] + l
        else:
            out += ' ' + l
    return normalize_spaces_keep_lines(out)


def normalize_spaces_keep_lines(s: str) -> str:
    return '\n'.join(normalize_spaces(x) for x in s.split('\n') if x.strip())


def fold(s: str) -> str:
    """Accent-insensitive lowercase form for matching and deduplication."""
    s = az_lower(s)
    s = s.translate(str.maketrans('əöüğçşı', 'eougcsi'))
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if ch.isalnum() or ch == ' ')
    return re.sub(r'\s+', ' ', s).strip()
