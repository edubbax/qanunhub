"""Extracts question/answer pairs from the "Sual-cavab" files (questions end with '?')."""
import re

from textutil import join_lines


def parse_qa(text: str):
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    pairs = []
    q_lines = []
    a_lines = []
    in_q = False
    last_no = 0
    for idx, l in enumerate(lines):
        is_header = l.isupper() and len(l) < 90
        if is_header:
            continue
        nxt = lines[idx + 1] if idx + 1 < len(lines) else ''
        starts_q = bool(re.match(r'^(Sual\s*\d*\s*[:.]|\d{1,3}\s*[.)]\s)', l))
        numbered = re.match(r'^(?:Sual\s*)?(\d{1,3})\s*[.):]\s', l)
        no = int(numbered.group(1)) if numbered else None
        # A numbered section heading ('2. Sənədlərin hazırlanması üçün ümumi tələblər') before a question.
        if no is not None and not l.startswith('Sual') and not re.search(r'[.?!:;]$', l) and len(l) < 90 \
                and re.match(r'Sual\s*\d', nxt):
            continue
        # The next numbered question whose text wraps onto the following line: without this its first line would be
        # read as the end of the previous answer and the card title would keep only the wrapped tail.
        if no is not None and last_no < no <= last_no + 3 and not l.endswith('?') and len(l) > 15 and (a_lines or not q_lines):
            if q_lines and a_lines:
                pairs.append((q_lines, a_lines))
            q_lines, a_lines = [l], []
            in_q = True
            last_no = no
            continue
        if l.endswith('?') or (starts_q and l.endswith('?')):
            if no is not None:
                last_no = no
            carry = []
            if q_lines and a_lines:
                # Unnumbered questions that wrap: the lines after the answer's last finished sentence open the question.
                k = len(a_lines)
                while k > 0 and not re.search(r'[.;:!»")]$', a_lines[k - 1]):
                    k -= 1
                if 0 < k < len(a_lines) and re.match(r'[A-ZƏÖÜÇŞĞİ"“«]', a_lines[k]):
                    carry, a_lines = a_lines[k:], a_lines[:k]
                pairs.append((q_lines, a_lines))
                q_lines, a_lines = [], []
            if carry:
                q_lines = carry + [l]
            elif in_q and not a_lines:
                q_lines.append(l)
            else:
                q_lines = [l]
            in_q = True
            continue
        if in_q and not a_lines and not q_lines[-1].endswith('?') and len(q_lines) < 3:
            q_lines.append(l)
            continue
        if q_lines:
            in_q = False
            a_lines.append(re.sub(r'^Cavab\s*[:.]\s*', '', l))
    if q_lines and a_lines:
        pairs.append((q_lines, a_lines))
    out = []
    for q, a in pairs:
        qt = join_lines(q)
        qt = re.sub(r'^(Sual\s*\d*\s*[:.]\s*|\d{1,3}\s*[.)]\s*)', '', qt).strip()
        at = join_lines(a)
        if 8 <= len(qt) <= 400 and 1 <= len(at) <= 1500:
            out.append({'q': qt, 'a': at})
    return out
