"""Programme (01.06.2026) as data: topics, category scope per article and source file mapping."""
import re

ALL = ['AB', 'AC', 'BA', 'BB']

# id, programme no, title, short title, categories, free, law title, note
TOPICS = [
    ('konstitusiya', '1', 'Azərbaycan Respublikasının Konstitusiyası', 'Konstitusiya', ALL, True, 'Azərbaycan Respublikasının Konstitusiyası (12.11.1995)', None),
    ('dovlet-qullugu', '2.1', '«Dövlət qulluğu haqqında» Qanun', 'Dövlət qulluğu', ALL, False, '«Dövlət qulluğu haqqında» AR Qanunu (21.07.2000, № 926-IQ)', None),
    ('tesnifat', '2.2', 'İnzibati və yardımçı vəzifələrin Təsnifat Toplusu', 'Təsnifat Toplusu', ['AB', 'AC'], False, 'Təsnifat Toplusu (Fərman № 911, 04.08.2003)', 'Bu mövzu üzrə material hazırlanır.'),
    ('etik', '2.3', '«Dövlət qulluqçularının etik davranış qaydaları haqqında» Qanun', 'Etik davranış', ALL, False, '«Dövlət qulluqçularının etik davranış qaydaları haqqında» AR Qanunu (31.05.2007, № 352-IIIQ)', None),
    ('korrupsiya', '3', '«Korrupsiyaya qarşı mübarizə haqqında» Qanun', 'Korrupsiya', ALL, False, '«Korrupsiyaya qarşı mübarizə haqqında» AR Qanunu (13.01.2004, № 580-IIQ)', None),
    ('melumat-azadligi', '4', '«Məlumat azadlığı haqqında» Qanun', 'Məlumat azadlığı', ['BA', 'BB'], False, '«Məlumat azadlığı haqqında» AR Qanunu (19.06.1998, № 505-IQ)', None),
    ('muraciet', '5', '«Vətəndaşların müraciətləri haqqında» Qanun', 'Müraciətlər', ['BA', 'BB'], False, '«Vətəndaşların müraciətləri haqqında» AR Qanunu (30.09.2015, № 1308-IVQ)', None),
    ('informasiya', '6', '«İnformasiya əldə etmək haqqında» Qanun', 'İnformasiya əldə etmək', ['AB', 'AC'], False, '«İnformasiya əldə etmək haqqında» AR Qanunu (30.09.2005, № 1024-IIQ)', None),
    ('dovlet-sirri', '7', '«Dövlət sirri haqqında» Qanun', 'Dövlət sirri', ['AB', 'AC'], False, '«Dövlət sirri haqqında» AR Qanunu (07.09.2004, № 733-IIQ)', None),
    ('nha', '8', '«Normativ hüquqi aktlar haqqında» Konstitusiya Qanunu', 'Normativ hüquqi aktlar', ['AB', 'AC', 'BA'], False, '«Normativ hüquqi aktlar haqqında» AR Konstitusiya Qanunu (21.12.2010, № 21-IVKQ)', 'Yalnız proqramda göstərilən bənd və maddələr.'),
    ('dovlet-dili', '9', '«Dövlət dili haqqında» Qanun', 'Dövlət dili', ALL, False, '«Azərbaycan Respublikasında dövlət dili haqqında» AR Qanunu (30.09.2002, № 365-IIQ)', None),
    ('inzibati-icraat', '10', '«İnzibati icraat haqqında» Qanun', 'İnzibati icraat', ['AB', 'AC', 'BA'], False, '«İnzibati icraat haqqında» AR Qanunu (21.10.2005, № 1036-IIQ)', 'BA: yalnız I–II fəsil. AB, AC: I–IV, VI–VII, VIII (m. 81) və IX fəsil.'),
    ('ombudsman', '11', '«İnsan hüquqları üzrə müvəkkil (ombudsman) haqqında» Konstitusiya Qanunu', 'Ombudsman', ['AB', 'AC', 'BA'], False, '«AR İnsan hüquqları üzrə müvəkkili (ombudsman) haqqında» Konstitusiya Qanunu (28.12.2001, № 246-IIKQ)', 'Maddə 1, 2, 4, 8–13, 13-1.'),
    ('mehkemeler', '12', '«Məhkəmələr və hakimlər haqqında» Qanun', 'Məhkəmələr və hakimlər', ALL, False, '«Məhkəmələr və hakimlər haqqında» AR Qanunu (10.06.1997, № 310-IQ)', 'Maddə 1, 3–5, 7–14, 19.'),
    ('elektron-imza', '13', '«Elektron imza və elektron sənəd haqqında» Qanun', 'Elektron imza', ALL, False, '«Elektron imza və elektron sənəd haqqında» AR Qanunu (09.03.2004, № 602-IIQ)', None),
    ('satinalma', '14', '«Dövlət satınalmaları haqqında» Qanun (2023)', 'Dövlət satınalmaları', ['AB'], False, '«Dövlət satınalmaları haqqında» AR Qanunu (14.07.2023, № 988-VIQ)', 'Bu mövzu üzrə material hazırlanır.'),
    ('budce', '15', '«Büdcə sistemi haqqında» Qanun', 'Büdcə sistemi', ['AB'], False, '«Büdcə sistemi haqqında» AR Qanunu (02.07.2002, № 358-IIQ)', 'Bu mövzu üzrə material hazırlanır.'),
    ('mulki', '16', 'Mülki Məcəllə', 'Mülki Məcəllə', ['AB', 'AC'], False, 'AR Mülki Məcəlləsi (01.09.2000)', 'AC: fiziki və hüquqi şəxslər. AB: həm də müqavilə hüququ (m. 389–424).'),
    ('emek', '17', 'Əmək Məcəlləsi', 'Əmək Məcəlləsi', ['AB', 'AC'], False, 'AR Əmək Məcəlləsi (01.02.1999)', 'Yalnız proqramda göstərilən maddələr.'),
    ('karguzarliq', '18', 'Kargüzarlığın aparılmasına dair Təlimat', 'Kargüzarlıq', ALL, False, 'Kargüzarlığın aparılmasına dair Təlimat (Fərman № 935, 27.09.2003)', None),
    ('remzler', '19', 'Dövlət rəmzləri: Bayraq, Gerb, Himn', 'Dövlət rəmzləri', ALL, False, 'Dövlət bayrağı (2004), Dövlət gerbi (2019) və Dövlət himni (2019) haqqında qanunlar', None),
]


def rng(a, b):
    return list(range(a, b + 1))


def _art_num(ref: str):
    m = re.match(r'(\d+)(?:-(\d+))?', ref)
    return (int(m.group(1)), int(m.group(2) or 0)) if m else (0, 0)


def article_categories(topic: str, ref: str):
    """Categories for which an article (ref like '81', '13-1', '404-1', '1.0.1') is in the programme. None = not in scope."""
    n, sub = _art_num(ref)
    if topic == 'inzibati-icraat':
        if n <= 19:
            return ['AB', 'AC', 'BA']
        return ['AB', 'AC']
    if topic == 'ombudsman':
        return ['AB', 'AC', 'BA'] if n in (1, 2, 4, 8, 9, 10, 11, 12, 13) else None
    if topic == 'mehkemeler':
        return ALL if n in (1, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 19) else None
    if topic == 'mulki':
        if n in rng(24, 33) + [39] + rng(43, 47) + rng(49, 56):
            return ['AB', 'AC']
        if 389 <= n <= 411 or 417 <= n <= 424:
            return ['AB']
        return None
    if topic == 'emek':
        allowed = [6, 7, 42, 43, 44, 45, 46, 48, 49] + rng(68, 72) + rng(74, 80) + [89, 90, 91, 93, 94] + rng(103, 109) + \
            rng(110, 117) + [119, 120] + rng(122, 130) + [131, 135, 137, 175, 179, 186, 187, 189, 190]
        return ['AB', 'AC'] if n in allowed else None
    if topic == 'nha':
        return ['AB', 'AC', 'BA'] if (ref.startswith('1.0') or n in (1, 2, 3, 4, 17, 18, 19, 20, 28, 83, 85, 86, 87, 88, 89, 92)) else None
    cats = next(t[4] for t in TOPICS if t[0] == topic)
    return cats


def classify_file(title: str):
    """Maps a Drive file title (diacritics stripped by Drive export) to (topic, kind, sublaw, categories)."""
    t = title
    kind = None
    if re.search(r'Mvzu', t):
        kind = 'law'
    elif re.search(r'Konspekt', t):
        kind = 'konspekt'
    elif re.search(r'Sual', t):
        kind = 'qa'
    elif re.search(r'Test|Qliz', t):
        kind = 'test'
    elif t.startswith('nzibati craat haqqnda (Shamkhal'):
        kind = 'law'
    rules = [
        ('Konstitusiya', 'konstitusiya', None), ('Dvlt qulluu', 'dovlet-qullugu', None), ('Etik davran', 'etik', None),
        ('Korrupsiya', 'korrupsiya', None), ('Mlumat azadl', 'melumat-azadligi', None), ('Vtndalarn m', 'muraciet', None),
        ('nformasiya ld', 'informasiya', None), ('Dvlt sirri', 'dovlet-sirri', None), ('Normativ Hquqi', 'nha', None),
        ('Dvlt dili', 'dovlet-dili', None), ('nzibati craat AC', 'inzibati-icraat', 'ac'), ('nzibati craat haqqnda', 'inzibati-icraat', 'ba'),
        ('Ombudsman', 'ombudsman', None), ('Mhkmlr', 'mehkemeler', None), ('Elektron imza', 'elektron-imza', None),
        ('Mlki Mcll', 'mulki', None), ('mk Mcllsi', 'emek', None), ('Kargzarlq', 'karguzarliq', None),
        ('Bayraq', 'remzler', 'bayraq'), ('Gerb', 'remzler', 'gerb'), ('Himn', 'remzler', 'himn'), ('Rmzlr', 'remzler', None),
    ]
    for prefix, topic, sub in rules:
        if t.startswith(prefix):
            if topic == 'inzibati-icraat':
                cats = ['AB', 'AC'] if sub == 'ac' else ['AB', 'AC', 'BA']
            else:
                cats = next(x[4] for x in TOPICS if x[0] == topic)
            return topic, kind, sub, cats
    return None, kind, None, None


# Corrections found during the content review (plan, section 0). Keyed by (file prefix, question number).
KEY_OVERRIDES = {
    ('nzibati craat AC - Test', 1): {'answer': 'A', 'note': 'Açarda D göstərilib; «İnzibati icraat haqqında» Qanunun 7.1-ci maddəsinə görə düzgün cavab A-dır (2, 4, 5).'},
}

# Files whose questions must not be published without a lawyer's review.
DRAFT_FILES = {
    'Kargzarlq - Test 2': 'Açar yoxdur; suallar hüquqşünas tərəfindən cavablandırılmalıdır.',
}

# Wording that marks outdated or wrong facts; items and cards containing it are held back.
OUTDATED_TERMS = [
    (r'Milli Təhlükəsizlik (Nazirliyi|Xidməti)', 'MTN 2015-ci ildə ləğv edilib; funksiyalar DTX-yə verilib.'),
    (r'Rabitə və Yüksək Texnologiyalar Nazirliyi', 'Qurum 2021-ci ildən Rəqəmsal İnkişaf və Nəqliyyat Nazirliyidir.'),
    (r'\bÇox məxfi\b|\bçox məxfi\b|\bÇox gizli\b|\bçox gizli\b', 'Qanunda məxfilik dərəcələri: «xüsusi əhəmiyyətli», «tam məxfi», «məxfi».'),
    (r'mart ayının 15-dək Milli Məclisə', 'Qanunun 14.1-ci maddəsi: il bitdikdən sonra 2 ay ərzində Prezidentə.'),
]

QA_TEXT_FIXES = [
    # Gerb sual-cavab: the law (m. 7.2) names the President, not Milli Məclis.
    ('müvafiq icra hakimiyyəti orqanının müəyyən etdiyi orqan (Milli Məclis)', 'müvafiq icra hakimiyyəti orqanının müəyyən etdiyi orqan (Prezident)'),
]
