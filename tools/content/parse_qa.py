"""Extracts question/answer pairs from the "Sual-cavab" files (questions end with '?')."""
import re

from textutil import join_lines


def parse_qa(text: str):
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    pairs = []
    q_lines = []
    a_lines = []
    in_q = False
    for l in lines:
        is_header = l.isupper() and len(l) < 90
        if is_header:
            continue
        starts_q = bool(re.match(r'^(Sual\s*\d*\s*[:.]|\d{1,3}\s*[.)]\s)', l))
        if l.endswith('?') or (starts_q and l.endswith('?')):
            if q_lines and a_lines:
                pairs.append((q_lines, a_lines))
                q_lines, a_lines = [], []
            if in_q and not a_lines:
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
