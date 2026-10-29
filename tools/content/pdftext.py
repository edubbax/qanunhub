"""PDF to text with two-column page detection (pdftotext -layout, then split at the gutter)."""
import subprocess


def _gutter(lines, width):
    """Column index of a vertical gap shared by most text lines in the middle of the page, or None."""
    rows = [l for l in lines if len(l.strip()) > 0]
    long_rows = [l for l in rows if len(l.rstrip()) > width * 0.6]
    if len(rows) < 8 or len(long_rows) < len(rows) * 0.3:
        return None
    best = None
    for c in range(int(width * 0.3), int(width * 0.7)):
        gap = 0
        both = 0
        for l in rows:
            seg = l[c - 1:c + 2] if len(l) > c + 1 else '   '
            if seg.strip() == '':
                gap += 1
                if l[:c].strip() and l[c:].strip():
                    both += 1
        score = gap / len(rows)
        if score >= 0.95 and both >= len(rows) * 0.25:
            if best is None or score > best[1] or (score == best[1] and both > best[2]):
                best = (c, score, both)
    return best[0] if best else None


def pdf_to_text(path: str, columns: bool = True) -> str:
    if not columns:
        return subprocess.run(['pdftotext', '-enc', 'UTF-8', path, '-'], capture_output=True, text=True).stdout
    raw = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', path, '-'], capture_output=True, text=True).stdout
    pages = raw.split('\f')
    out = []
    for page in pages:
        lines = page.split('\n')
        width = max((len(l) for l in lines), default=0)
        g = _gutter(lines, width) if width > 60 else None
        if g is None:
            out.append('\n'.join(l.strip() for l in lines))
            continue
        left = [l[:g].strip() for l in lines]
        right = [l[g:].strip() for l in lines]
        out.append('\n'.join(left) + '\n' + '\n'.join(right))
    return '\n'.join(out)
