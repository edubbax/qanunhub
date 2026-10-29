"""Splits a law text into articles (or, for the Kargüzarlıq Təlimat, into parts and paragraphs)."""
import re

from textutil import az_lower, join_lines

ART_HEAD = re.compile(r'^\s*M\s?a\s?d\s?d\s?[əe]\s+(\d[\d\s]*(?:-\s?\d+)?)\s?\.\s*(.*)$')
CHAPTER = re.compile(r'^\s*([IVXL]+)\s*f\s?ə\s?s\s?i\s?l\b\.?\s*(.*)$', re.I)
SECTION = re.compile(r'^(BİRİNCİ|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ)\s+BÖLMƏ', re.I)
NOTE = re.compile(r'^\s*(Qeyd|Kod|Yadda saxla)\s*:', re.I)


def _title_case(s: str) -> str:
    s = s.strip(' .')
    if s.isupper():
        s = az_lower(s)
        s = ('İ' if s[:1] == 'i' else s[:1].upper()) + s[1:]
    return s


def parse_articles(text: str):
    """Returns [{'ref': '1', 'title': ..., 'chapter': ..., 'body': ..., 'notes': [...]}] in document order."""
    lines = text.split('\n')
    arts = []
    chapter = None
    pending_chapter_title = False
    cur = None
    preamble = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        m = ART_HEAD.match(line)
        ch = CHAPTER.match(line)
        if ch and len(line) < 80:
            chapter = _title_case(ch.group(2)) if ch.group(2) else None
            pending_chapter_title = not ch.group(2)
            continue
        if pending_chapter_title and line.isupper() and len(line) < 90:
            chapter = _title_case(line)
            pending_chapter_title = False
            continue
        pending_chapter_title = False
        if SECTION.match(line):
            continue
        if m:
            ref = re.sub(r'\s', '', m.group(1))
            title = m.group(2).strip()
            cur = {'ref': ref, 'title': title, 'chapter': chapter, 'lines': [], 'notes': []}
            arts.append(cur)
            continue
        if cur is None:
            preamble.append(line)
            continue
        if not cur['title'] and not cur['lines'] and len(line) < 120 and not re.match(r'^\d', line):
            cur['title'] = line
            continue
        if NOTE.match(line):
            cur['notes'].append(line)
        else:
            cur['lines'].append(line)
    out = []
    seen = set()
    for a in arts:
        if a['ref'] in seen:  # repeated article (editing error in one source file)
            continue
        seen.add(a['ref'])
        body = join_lines(a['lines'])
        out.append({'ref': a['ref'], 'title': a['title'].strip(' .'), 'chapter': a['chapter'], 'body': body,
                    'notes': [join_lines([n]) for n in a['notes']]})
    return out, join_lines(preamble)


def parse_karguzarliq(text: str):
    """The Təlimat has numbered parts ("1. Ümumi müddəalar") and globally numbered paragraphs ("12. ...")."""
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    start = next((i for i, l in enumerate(lines) if re.match(r'^T\s?Ə\s?L\s?İ\s?M\s?A\s?T$', l) or l.endswith('T Ə L İ M A T')), 0)
    part_no = 0
    parts = []
    cur_part = None
    cur_par = None
    for l in lines[start + 1:]:
        m = re.match(r'^(\d{1,2})\.\s+([A-ZƏÖÜÇŞĞİ][^.;:]{2,95})$', l)
        if m and int(m.group(1)) == part_no + 1 and not l.endswith('.'):
            part_no += 1
            cur_part = {'ref': f'hissə {part_no}', 'title': m.group(2).strip(), 'pars': []}
            parts.append(cur_part)
            cur_par = None
            continue
        if cur_part is None:
            continue
        p = re.match(r'^(\d{1,3}(?:-\d+)?)\.\s+(.*)$', l)
        if p and not re.match(r'^\d{1,3}\.\d', l):
            cur_par = {'no': p.group(1), 'lines': [p.group(2)]}
            cur_part['pars'].append(cur_par)
        elif cur_par is not None:
            cur_par['lines'].append(l)
    out = []
    for part in parts:
        for par in part['pars']:
            out.append({'ref': f"bənd {par['no']}", 'title': part['title'], 'chapter': f"{part['ref'].capitalize()}. {part['title']}",
                        'body': join_lines(par['lines']), 'notes': []})
    return out
