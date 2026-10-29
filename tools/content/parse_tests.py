"""Parses multiple-choice test files: numbered questions, A–D options, numbered statements and the answer key."""
import re

from textutil import join_lines, normalize_spaces


def flat(s: str) -> str:
    """One-line text: rejoins hyphenated words and wrapped lines."""
    s = re.sub(r'(?<=[a-zəıöüğçş])-\n(?=[a-zəıöüğçş])', '', s)
    return normalize_spaces(s.replace('\n', ' '))

Q_START = re.compile(r'^\s*(?:Sual\s*)?(\d{1,3})\s*[.)]\s*(.*)$')
STATEMENT = re.compile(r'^\s*(\d{1,2})\s*[.)]\s*(.+)$')
LETTERS = 'ABCD'


def _is_key_line(l: str) -> bool:
    s = l.strip()
    if re.fullmatch(r'(Sual|Cavab|Cavablar|Açar|Düzgün cavablar|Cavab açarı)[\s:]*(Sual|Cavab)?\s*', s, re.I):
        return True
    if re.fullmatch(r'(?:\d{1,3}\s*[.)]?\s*[A-Da-d]\b[\s,;]*){1,}', s):
        return True
    if re.fullmatch(r'\d{1,3}|[A-D]', s):
        return True
    if re.fullmatch(r'(?:\d{1,3}\s+){4,}\d{1,3}', s):
        return True
    if re.fullmatch(r'(?:[A-D]\s+){4,}[A-D]', s):
        return True
    return False


def _split_key_region(lines):
    """Index of the first line of the answer key, scanning back from the end; tolerates a few OCR-garbled lines."""
    idx = len(lines)
    misses = 0
    found = False
    for i in range(len(lines) - 1, -1, -1):
        s = lines[i].strip()
        if not s:
            continue
        if _is_key_line(s):
            idx = i
            found = True
            misses = 0
        elif found and len(s) <= 4:
            misses += 1
            if misses > 2:
                break
        else:
            if found:
                break
    return idx if found else len(lines)


def _longest_run(nums):
    """Longest run of consecutive integers (drops stray page numbers inside key tables)."""
    best, cur = [], []
    for n in nums:
        if cur and n == cur[-1] + 1:
            cur.append(n)
        else:
            cur = [n]
        if len(cur) > len(best):
            best = list(cur)
    return best


def parse_key(region: str, max_q: int):
    """Returns {question_no: 'A' | [statement numbers]} from a key region in several layouts."""
    lists = {}
    # Open (multi-select) keys: "3 1.3.5", "3 - 1,3,5"; a single statement number ("2 1") also occurs.
    for m in re.finditer(r'(?<![\d.])(\d{1,3})\s*[.)–-]?\s+((?:\d\s*[.,]\s*){1,6}\d|\d)(?![\d.,A-Za-z])', region):
        n = int(m.group(1))
        if 1 <= n <= max_q and n not in lists:
            lists[n] = [int(x) for x in re.findall(r'\d', m.group(2))]
    region = re.sub(r'(?<![\d.])(\d{1,3})\s*[.)–-]?\s+((?:\d\s*[.,]\s*){1,6}\d)(?![\d])', ' ', region)
    tokens = re.findall(r'(?<![\w.])(\d{1,3})(?![\d])|(?<![A-Za-zƏəÖöÜüĞğÇçŞşİı])([A-Da-d])(?![A-Za-zƏəÖöÜüĞğÇçŞşİı)])', region)
    toks = [('n', int(a)) if a else ('l', b.upper()) for a, b in tokens]
    # Layout 1: number immediately followed by a letter ("1 C 21 B", "1.A 221.A").
    pairs = {}
    for i in range(len(toks) - 1):
        if toks[i][0] == 'n' and toks[i + 1][0] == 'l' and 1 <= toks[i][1] <= max_q:
            pairs.setdefault(toks[i][1], toks[i + 1][1])
    # Layout 2: a row of numbers followed by a row of letters ("201 202 ... 240" / "D C ...").
    blocks = {}
    i = 0
    while i < len(toks):
        if toks[i][0] == 'n':
            j = i
            while j < len(toks) and toks[j][0] == 'n':
                j += 1
            k = j
            while k < len(toks) and toks[k][0] == 'l':
                k += 1
            nums = _longest_run([t[1] for t in toks[i:j]])
            lets = [t[1] for t in toks[j:k]]
            if len(nums) >= 3 and len(lets) == len(nums):
                for n, l in zip(nums, lets):
                    if 1 <= n <= max_q:
                        blocks.setdefault(n, l)
            elif len(nums) >= 3 and nums[-1] == len(lets) and nums[0] > 1:
                # The first numbers of the row were lost; letters still cover 1..N.
                for n in range(1, len(lets) + 1):
                    if n <= max_q:
                        blocks.setdefault(n, lets[n - 1])
            i = max(k, i + 1)
        else:
            i += 1
    best = pairs if len(pairs) >= len(blocks) else blocks
    return dict(best), lists


def _split_options(block: str, lower: bool):
    """Finds A)–D) markers (any order on the page, e.g. a/c on one line and b/d on the next)."""
    for letters in (('abcd', 'ABCD') if lower else ('ABCD', 'abcd')):
        marks = [(m.start(), m.end(), m.group(1).upper()) for m in re.finditer(r'(?:(?<=\s)|^)([' + letters + r'])\s?\)', block)]
        first_a = next((i for i, mk in enumerate(marks) if mk[2] == 'A'), None)
        if first_a is None:
            continue
        chosen = {}
        for mk in marks[first_a:]:
            if mk[2] not in chosen:
                chosen[mk[2]] = mk
        if not all(L in chosen for L in 'ABC'):
            continue
        ordered = sorted(chosen.values())
        texts = {}
        for i, (st, en, L) in enumerate(ordered):
            stop = ordered[i + 1][0] if i + 1 < len(ordered) else len(block)
            texts[L] = flat(block[en:stop])
        opts = [texts[L] for L in 'ABCD' if L in texts]
        return block[:marks[first_a][0]], opts
    return None, None


def _split_statements(stem: str):
    lines = stem.split('\n')
    head, stmts = [], []
    for l in lines:
        m = STATEMENT.match(l)
        if m and (int(m.group(1)) == len(stmts) + 1):
            stmts.append(m.group(2).strip())
        elif stmts:
            stmts[-1] += ' ' + l.strip()
        else:
            head.append(l)
    if len(stmts) < 2:
        return stem, None
    return '\n'.join(head), [flat(s) for s in stmts]


def parse_test(text: str):
    lines = [l for l in text.split('\n')]
    k_idx = _split_key_region(lines)
    body_lines = lines[:k_idx]
    key_region = '\n'.join(lines[k_idx:])
    lower = len(re.findall(r'(?:^|\s)[abcd]\)', text)) > len(re.findall(r'(?:^|\s)[ABCD]\)', text))

    questions = []
    cur = None
    expected = 1
    seen_opts = False
    section = 0
    for raw in body_lines:
        l = raw.strip()
        if not l:
            continue
        m = Q_START.match(l)
        n = int(m.group(1)) if m else -1
        restart = m and n == 1 and seen_opts and expected > 10 and len(m.group(2)) > 15
        if restart:
            section += 1
        open_next = (not seen_opts and cur is not None and section > 0 and n == expected and n != cur['stmt'] + 1)
        if m and (restart or open_next or (cur is None and n <= 3) or (seen_opts and expected <= n <= expected + 3) or (not seen_opts and n == expected and n >= 8)):
            cur = {'no': n, 'section': section, 'lines': [m.group(2)], 'stmt': 0}
            questions.append(cur)
            expected = n + 1
            seen_opts = False
            continue
        if cur is None:
            continue
        cur['lines'].append(l)
        sm = STATEMENT.match(l)
        if sm and int(sm.group(1)) == cur['stmt'] + 1:
            cur['stmt'] += 1
        if re.search(r'(?:^|\s)[Aa]\s?\)', l):
            seen_opts = True

    # Keys can also hide in the last question's tail when the key has no clear header.
    if questions and not key_region.strip():
        tail = '\n'.join(questions[-1]['lines'])
        m = re.search(r'\n(?:\d{1,3}\s*[.)]?\s*[A-D]\b\s*){5,}', '\n' + tail)
        if m:
            key_region = tail[m.start():]

    max_no = max((q['no'] for q in questions), default=0)
    letters, lists = parse_key(key_region, max_no) if questions else ({}, {})
    key = {**{n: v for n, v in lists.items()}, **letters}
    out = []
    for q in questions:
        block = '\n'.join(q['lines'])
        stem, opts = _split_options(block, lower)
        k = letters.get(q['no']) if q.get('section', 0) == 0 else None
        if opts:
            stem_text, stmts = _split_statements(stem)
            answer = None
            if isinstance(k, str):
                answer = [LETTERS.index(k)] if LETTERS.index(k) < len(opts) else None
            out.append({'no': q['no'], 'type': 'single', 'stem': flat(stem_text), 'statements': stmts,
                        'options': opts, 'answer': answer, 'raw_key': k})
        else:
            stem_text, stmts = _split_statements(block)
            k = lists.get(q['no']) if q.get('section', 0) > 0 or q['no'] not in letters else None
            if stmts and isinstance(k, list):
                answer = [x - 1 for x in k if 1 <= x <= len(stmts)]
                out.append({'no': q['no'], 'type': 'multi', 'stem': flat(stem_text), 'statements': None,
                            'options': stmts, 'answer': answer or None, 'raw_key': k})
            else:
                out.append({'no': q['no'], 'type': 'unknown', 'stem': join_lines(block.split('\n')), 'statements': None,
                            'options': [], 'answer': None, 'raw_key': k})
    return out, key
