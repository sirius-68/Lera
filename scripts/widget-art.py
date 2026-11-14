#!/usr/bin/env python3
"""Draws everything the Android side shows of Lera: widget faces, face-filled cards, the app icon.

Run from the repo root:  python3 scripts/widget-art.py

The shapes are the ones src/mascot/Lera.tsx draws. A "look" here is a still of one of her moods,
put together from the same parts (eyes, brows, mouth, hands, something worn, a tint).
Output goes to android-overrides/res/ and public/ (icon.svg, rendered to PNG by scripts/icon-png.mjs).
"""
import os

RES = 'android-overrides/res'
OUT = f'{RES}/drawable'
WHITE, INK, BROW = '#FFFFFFFF', '#FF1B1B1B', '#FF2B2494'

TINTS = {
    None: ('#FF6C63FF', '#FF5148E0', '#FF050505'),
    'menace': ('#FF3A0A14', '#FF24060C', '#FF14040A'),
    'frozen': ('#FF8EC5FF', '#FF5F9FE0', '#FF24456B'),
    'ghost': ('#FFE4E1FF', '#FFC5C0F5', '#FFB9B4E6'),
    'dusty': ('#FF9794B2', '#FF7C7996', '#FF4A4860'),
    'fossil': ('#FFA8A294', '#FF8A8477', '#FF6B665C'),
}


def rrect(x, y, w, h, r):
    return f'M{x + r},{y}h{w - 2 * r}a{r},{r} 0 0 1 {r},{r}v{h - 2 * r}a{r},{r} 0 0 1 -{r},{r}h-{w - 2 * r}a{r},{r} 0 0 1 -{r},-{r}v-{h - 2 * r}a{r},{r} 0 0 1 {r},-{r}z'


def oval(cx, cy, rx, ry=None):
    ry = rx if ry is None else ry
    return f'M{cx - rx},{cy}a{rx},{ry} 0 1 0 {2 * rx},0a{rx},{ry} 0 1 0 -{2 * rx},0z'


def fill(d, color, alpha=None):
    a = f' android:fillAlpha="{alpha}"' if alpha is not None else ''
    return f'<path android:fillColor="{color}"{a} android:pathData="{d}"/>'


def line(d, color, width):
    return f'<path android:strokeColor="{color}" android:strokeWidth="{width}" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="{d}"/>'


def group(inner, rot=0, px=0, py=0, dx=0, dy=0, sx=1, sy=1):
    return f'<group android:rotation="{rot}" android:pivotX="{px}" android:pivotY="{py}" android:translateX="{dx}" android:translateY="{dy}" android:scaleX="{sx}" android:scaleY="{sy}">{"".join(inner)}</group>'


def eyes_open(dx=0.0, dy=0.0, scale=1.0, shine=False):
    out = []
    for x in (15.31, 32.81):
        out.append(fill(rrect(x, 30.1, 12.03, 20.78, 4.5), WHITE))
        w, h = round(6.56 * scale, 2), round(8.75 * scale, 2)
        px, py = round(x + 2.73 + dx + (6.56 - w) / 2, 2), round(37.76 + dy + (8.75 - h) / 2, 2)
        out.append(fill(rrect(px, py, w, h, round(w / 2, 2)), INK))
        out.append(fill(oval(round(px + w * 0.27, 2), round(py + h * 0.25, 2), 1.05 if not shine else 1.5), WHITE))
        if shine:
            out.append(fill(oval(round(px + w * 0.7, 2), round(py + h * 0.72, 2), 0.9), WHITE))
    return out


def lids(body):
    return [fill(rrect(14.6, 29.2, 13.4, 10.6, 4.6), body), fill(rrect(32.1, 29.2, 13.4, 10.6, 4.6), body)]


def glow_eyes():
    eye_l, eye_r = 'M13.6 36.4l13.6 5v3.4a6.8 5.4 0 0 1-13.6-1.6z', 'M47 36.4l-13.6 5v3.4a6.8 5.4 0 0 0 13.6-1.6z'
    out = []
    for d, cx in ((eye_l, 20.4), (eye_r, 40.2)):
        out.append(group([fill(d, '#FFFF2D46', 0.2)], px=cx, py=42, sx=1.45, sy=1.45))
        out.append(group([fill(d, '#FFFF2D46', 0.4)], px=cx, py=42, sx=1.2, sy=1.2))
        out.append(fill(d, '#FFFF4D5E'))
        out.append(group([fill(d, '#FFFFC2C8')], px=cx, py=43, sx=0.45, sy=0.45))
    return out


ARC = [line('M15.6 43.5q5.7-9.4 11.4 0', WHITE, 3.4), line('M33.1 43.5q5.7-9.4 11.4 0', WHITE, 3.4)]
SHUT = [line('M15.8 41.5q5.5 4.4 11 0', WHITE, 3.4), line('M33.3 41.5q5.5 4.4 11 0', WHITE, 3.4)]
XEYES = [line('M17 36.2l8.6 9M25.6 36.2l-8.6 9M34.6 36.2l8.6 9M43.2 36.2l-8.6 9', WHITE, 3.2)]
HOLLOW = [fill(oval(21.3, 40.6, 5.2, 8.2), '#FF2A2550'), fill(oval(38.8, 40.6, 5.2, 8.2), '#FF2A2550')]

MOUTHS = {
    'smile': [fill('M19.69 57.44C22.79 58.72 31.5 60.51 41.56 57.44 32.38 68.82 23.15 62.18 19.69 57.44Z', WHITE)],
    'big': [fill('M18.3 56.2c6 2.3 19 2.3 24.6 0-1.6 14.6-22.6 14.6-24.6 0Z', WHITE)],
    'frown': [line('M23.6 63q7-5.4 14 0', WHITE, 2.8)],
    'smirk': [line('M24 59.6q7.2 4.6 13.6-1.4', WHITE, 2.8)],
    'flat': [line('M25 60.4q5.6 1.6 11.2 0', WHITE, 2.8)],
    'tiny': [line('M27.8 61.2q2.8-1.8 5.6 0', WHITE, 2.8)],
    'wobble': [line('M23.6 61.4q3.5-3.2 7-.4t7.2-.5', WHITE, 2.8)],
    'wail': [fill('M21 66.4c1.5-12 17.7-12 19.2 0z', WHITE)],
    'o': [fill(oval(30.6, 60.6, 4.2, 5), WHITE)],
    'small-o': [fill(oval(30.6, 60.6, 2, 2.4), WHITE)],
    'grit': [fill(rrect(22.4, 56.8, 16.4, 7.6, 3.2), WHITE), line('M27.9 57.4v6.4M33.3 57.4v6.4M23 60.6h15.2', '#FF8EC5FF', 1)],
}


def brows(left, right, dy=0.0, color=BROW):
    return [group([line('M16.2 26.4q5-2.2 9.6 0', color, 2.2)], rot=left, px=21, py=26, dy=dy), group([line('M34.4 26.4q5-2.2 9.6 0', color, 2.2)], rot=right, px=39.2, py=26, dy=dy)]


BROWS = {'angry': (18, -18, 2.4), 'worried': (-18, 18, 1), 'up': (0, 0, -3.4), 'one': (8, -10, -1.5)}
CHEEKS = [fill(oval(12.6, 53.5, 3.6), '#FFFF9FC0', 0.8), fill(oval(48.6, 53.5, 3.6), '#FFFF9FC0', 0.8)]
SHADES = [fill('M10.6 31.4h18.6v8.2a9.3 9.3 0 0 1-18.6 0zM31 31.4h18.6v8.2a9.3 9.3 0 0 1-18.6 0z', '#FF14122E'), line('M9 33h42.4', '#FF14122E', 3.2), line('M14.6 35.4l5-2.4M35 35.4l5-2.4', '#8CFFFFFF', 1.6)]
FLAME = [fill('M30.6 -17c5.6 5 9.4 8.8 9.4 14.4a9.4 9.4 0 0 1-18.8 0c0-3.4 1.6-5.8 3.4-7.6.4 2.4 1.4 3.6 2.8 4.2-.8-4.2.6-7.8 3.2-11z', '#FFFF8A1F'), fill('M30.8 -8.6c2.6 2.4 4.2 4 4.2 6.6a4.4 4.4 0 0 1-8.8 0c0-1.6.8-2.8 1.8-3.6.2 1 .8 1.6 1.4 1.8-.2-1.8.4-3.4 1.4-4.8z', '#FFFFE066')]
BAND = [fill('M2.4 23q28.2-9.6 56.6 0l-.8 5.8q-27.4-8.8-55 0z', '#FFFF5A5F'), fill('M58 24.4l8-4 1.4 5.2-7.4 2.8zM58.6 27.2l6.6 5.6-4.4 2.4-3.6-5.2z', '#FFE14349')]
TEAR = [fill('M21.3 51.5c2.3 3.3 2.5 5.4 0 6.4-2.5-1-2.3-3.1 0-6.4z', '#FF9FD8FF')]
STREAMS = [line('M19.6 50v6M19.6 60v6M41.6 50v6M41.6 60v6', '#FF9FD8FF', 3.6)]
WEB = [line('M40 -7L64 17M64 -9L47 13M69 4H41M50 -3q7 2.4 9 9M45 2q11 3.4 14 14M62 17v8', '#FFD9D9E6', 1.1), fill(oval(62, 27, 2.2), '#FF4A4860')]
CRACKS = [line('M8 20l6 6-3 6 7 5M50 58l-5 4 4 5M40 8l3 7-4 4M20 62l4-4', '#FF5F5A50', 1.5)]
ICE = [fill('M11 4.6q19.6-13 39.2 0q-4.2 4.2-9.4 2.4q-5 3.2-10.2.6q-5.2 2.8-10.2-.4q-5.2 1.6-9.4-2.6z', '#FFF2F9FF'), fill('M2.6 34l2.2 9 2.2-8zM53.8 35l2.2 9 2.4-8z', '#FFDFF1FF')]
BANG = [line('M62 -6v9', '#FFFFE066', 3.2), fill(oval(62, 8.4, 1.9), '#FFFFE066')]
DREAM = [line('M51 2h8M53 2v6M57 2v5.2q0 1 1.2 0.8', '#FFFFD166', 1.9), line('M62 -9h6M65 -12v6', '#FFB8B3FF', 1.9), line('M69 -1l4.4 4.4M73.4 -1l-4.4 4.4', '#FF7EE0B0', 1.9)]
SPARK = [fill('M66 2l1.2 3.2 3.2 1.2-3.2 1.2L66 10.8l-1.2-3.2-3.2-1.2 3.2-1.2z', '#FFFFC940'), fill('M-4 8l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z', '#FFFFC940')]
JOY = [fill('M6 38c-3.4 1-5.4 2.6-5.4 4.8 2.4.6 4.4-.8 5.4-4.8zM55.2 38c3.4 1 5.4 2.6 5.4 4.8-2.4.6-4.4-.8-5.4-4.8z', '#FF9FD8FF')]
QMARK = [line('M58 -4q0-4 4-4t4 3.6q0 2.4-4 4.4v2', '#FFFFE066', 2.2), fill(oval(62, 6, 1.3), '#FFFFE066')]


def hand(cx, cy, body, edge, r=6.4):
    return [fill(oval(cx, cy, r), edge), fill(oval(cx, cy, r - 1.5), body)]


def look(eyes='open', brow=None, mouth='smile', tint=None, cheeks=False, hands=None, worn=(), around=(), gaze=(0, 0), pupil=1.0, halo=True, hair_alpha=None, body_only=False):
    """All the paths of one face, in her own coordinates (the body is 61 wide and 70 tall, from 0,0)."""
    body, edge, hair = TINTS[tint]
    out = []
    if halo:
        out.append(fill(oval(30.6, 40, 43), '#FFFFFFFF', 0.18))
    if hands == 'flex':
        out += [line('M3 47q-13-3-11.5-19', edge, 7.4), line('M58.2 47q13-3 11.5-19', edge, 7.4)]
    out.append(fill(rrect(0, 0.57, 61.25, 70, 30.62), body, 0.8 if tint == 'ghost' else None))
    out.append(line('M9 44c-1.6-9 .8-17 5-22', '#38FFFFFF', 2.6))
    for d in ('M0.547 33.928C11.12 29.049 32.266 15.105 32.266 0.568 21.693 0.399-0.547 6.584 0.547 33.928Z', 'M61.168 35.063C50.601 29.714 29.622 14.768 30.162 0.003 40.916 0.225 63.295 7.332 61.168 35.063Z'):
        out.append(fill(d, hair, hair_alpha))
    if body_only:
        return out
    for w in worn:
        if w in ('flame', 'ice'):
            out += {'flame': FLAME, 'ice': ICE}[w]
    if cheeks:
        out += CHEEKS
    if brow:
        l, r, dy = BROWS[brow]
        out += brows(l, r, dy, hair if tint in ('menace', 'ghost', 'fossil', 'dusty') else BROW)
    if eyes in ('open', 'half', 'shiny', 'tiny'):
        out += eyes_open(gaze[0], gaze[1], 1.34 if eyes == 'shiny' else 0.55 if eyes == 'tiny' else pupil, eyes == 'shiny')
        if eyes == 'half':
            out += lids(body)
    else:
        out += {'arc': ARC, 'shut': SHUT, 'x': XEYES, 'hollow': HOLLOW, 'glow': glow_eyes()}[eyes]
    out += MOUTHS[mouth]
    for w in worn:
        out += {'shades': SHADES, 'band': BAND, 'tear': TEAR, 'streams': STREAMS, 'web': WEB, 'cracks': CRACKS, 'flame': [], 'ice': []}[w]
    if hands == 'together':
        out += hand(25, 66.5, body, edge) + hand(36.5, 66.5, body, edge)
    elif hands == 'cheeks':
        out += hand(8.5, 54, body, edge) + hand(52.5, 54, body, edge)
    elif hands == 'flex':
        out += hand(-9, 26, body, edge, 8) + hand(70.2, 26, body, edge, 8)
    elif hands == 'up':
        out += hand(-6, 14, body, edge) + hand(67.2, 14, body, edge)
    for a in around:
        out += {'bang': BANG, 'dream': DREAM, 'spark': SPARK, 'joy': JOY, 'qmark': QMARK}[a]
    return out


# the faces the widgets use, one per moment
FACES = {
    'happy': look(mouth='big', cheeks=True, around=('spark',)),
    'cool': look(mouth='smirk', worn=('shades',)),
    'strong': look(brow='angry', mouth='big', hands='flex', worn=('band',)),
    'fired': look(brow='angry', mouth='big', cheeks=True, worn=('flame',), gaze=(0, 0.4)),
    'pleading': look(eyes='shiny', brow='worried', mouth='tiny', cheeks=True, hands='together', gaze=(0, -1.2)),
    'scared': look(eyes='tiny', brow='up', mouth='o', hands='cheeks', around=('bang',)),
    'cry': look(eyes='shut', brow='worried', mouth='wail', worn=('streams',)),
    'sad': look(brow='worried', mouth='frown', worn=('tear',), gaze=(0, 2.4)),
    'bored': look(eyes='half', mouth='flat', gaze=(2.4, 0.4)),
    'angry': look(brow='angry', mouth='grit', gaze=(0, 0.6)),
    'frozen': look(eyes='tiny', mouth='grit', tint='frozen', worn=('ice',)),
    'dusty': look(eyes='half', mouth='flat', tint='dusty', worn=('web',), gaze=(0, 1)),
    'ghost': look(eyes='hollow', mouth='small-o', tint='ghost'),
    'fossil': look(eyes='x', mouth='flat', tint='fossil', worn=('cracks',)),
    'sleepy': look(eyes='shut', mouth='small-o', around=('dream',)),
    'laugh': look(eyes='arc', mouth='big', cheeks=True, around=('joy',), hands='up'),
    'confused': look(brow='one', mouth='wobble', around=('qmark',), gaze=(1.5, -1.5)),
}


def vector(parts, w, h, vw, vh, note):
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/widget-art.py. {note} -->
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="{w}dp" android:height="{h}dp" android:viewportWidth="{vw}" android:viewportHeight="{vh}">
    {"".join(parts)}
</vector>
'''


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(text)


for name, parts in FACES.items():
    write(f'{OUT}/widget_lera_{name}.xml', vector([group(parts, dx=17, dy=24)], 95, 106, 95, 106, f'Lera, {name}.'))

# ── cards her face fills: the card is her, only the eyes and brow in view ──
ROUND = rrect(0, 0, 100, 100, 17)


def blend(card, zoomed, extra=()):
    clip = f'<clip-path android:pathData="{ROUND}"/>'
    return vector([f'<group>{clip}{fill("M0,0h100v100h-100z", card)}{"".join(extra)}{group(zoomed, dx=-17.3, dy=-12, sx=2.2, sy=2.2)}</group>'], 100, 100, 100, 100, 'A card filled by her face.')


def face_only(**kw):
    """A look without the body outline, halo or anything outside the face — the card supplies the colour."""
    parts = look(halo=False, **kw)
    return parts[1:]  # drop the body rectangle; keep shine, hair and the face


BLENDS = {
    'pleading': blend('#FF6C63FF', face_only(eyes='shiny', brow='worried', mouth='tiny', cheeks=True, gaze=(0, -1.6), hair_alpha=0.92)),
    'menace': blend('#FF3A0A14', face_only(eyes='glow', mouth='flat', tint='menace', brow='angry'), extra=[fill(oval(50, 78, 62, 40), '#FFFF2D46', 0.16)]),
    'bored': blend('#FF7A6FE8', face_only(eyes='half', mouth='flat', gaze=(2.6, 0.6), tint=None)),
    'frozen': blend('#FF8EC5FF', face_only(eyes='tiny', mouth='grit', tint='frozen', brow='worried')),
}
# the bored card is a paler purple, so its eyelids have to match the card rather than her usual colour
BLENDS['bored'] = BLENDS['bored'].replace('android:fillColor="#FF6C63FF"', 'android:fillColor="#FF7A6FE8"')
for name, xml in BLENDS.items():
    write(f'{OUT}/widget_blend_{name}.xml', xml)

# ── backgrounds ──
BG = {
    'purple': ('#FF8880FF', '#FF5A51EE'), 'violet': ('#FFA06BFF', '#FF6A3FE0'), 'orange': ('#FFFFB648', '#FFFF7A1A'), 'red': ('#FFFF6B7A', '#FFC81E4A'),
    'night': ('#FF34308A', '#FF14123A'), 'ice': ('#FF9DB0CC', '#FF5D6E8C'), 'green': ('#FF4FD89B', '#FF1E9E69'), 'blue': ('#FF4DA3FF', '#FF2F6BE0'),
    'dust': ('#FFB9B6C9', '#FF807D94'), 'mist': ('#FF3D3A66', '#FF1B1930'), 'stone': ('#FFC9BFA6', '#FF8C8169'), 'maroon': ('#FF5A1220', '#FF24060C'),
}
for name, (a, b) in BG.items():
    write(f'{OUT}/widget_bg_{name}.xml', f'''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="270" android:startColor="{a}" android:endColor="{b}"/>
    <corners android:radius="26dp"/>
</shape>
''')

# ── the flame beside the count: lit, at risk (with a warning dot), and out ──
FLAME_D = 'M12 2c4.6 4.3 7.8 7.4 7.8 12.2a7.8 7.8 0 0 1-15.6 0c0-2.9 1.3-4.9 2.8-6.4.3 2 1.2 3 2.3 3.5-.6-3.5.5-6.5 2.7-9.3z'
CORE_D = 'M12.1 11.4c2 1.9 3.3 3.2 3.3 5.2a3.4 3.4 0 0 1-6.8 0c0-1.3.6-2.2 1.4-2.9.2.8.6 1.3 1.1 1.5-.2-1.5.3-2.7 1-3.8z'
write(f'{OUT}/widget_flame.xml', vector([fill(FLAME_D, WHITE), fill(CORE_D, '#FFFF8A1F', 0.45)], 24, 24, 24, 24, 'Streak flame.'))
write(f'{OUT}/widget_flame_alert.xml', vector([fill(FLAME_D, WHITE, 0.55), fill(oval(17.5, 17.5, 6), '#FFFF3B4E'), line('M17.5 14.4v3.4', WHITE, 1.9), fill(oval(17.5, 20.3, 1), WHITE)], 24, 24, 24, 24, 'Streak at risk.'))
write(f'{OUT}/widget_flame_out.xml', vector([fill(FLAME_D, WHITE, 0.4)], 24, 24, 24, 24, 'Streak lost.'))

# ── the week row on the wide widget ──
write(f'{OUT}/widget_dot_on.xml', vector([fill(oval(12, 12, 10), WHITE), line('M7.6 12.4l3 3 5.8-6.2', '#FF6C63FF', 2.6)], 22, 22, 24, 24, 'A day practised.'))
write(f'{OUT}/widget_dot_off.xml', vector([fill(oval(12, 12, 10), WHITE, 0.28)], 22, 22, 24, 24, 'A day not practised.'))
write(f'{OUT}/widget_dot_today.xml', vector([fill(oval(12, 12, 10), '#FF000000', 0.22), line(oval(12, 12, 9), WHITE, 2)], 22, 22, 24, 24, 'Today, not yet practised.'))
# ── the app icon: her face fills it ──
ICON_FACE = face_only(mouth='big', cheeks=True, gaze=(0.6, -0.4))
write(f'{OUT}/ic_lera_foreground.xml', vector([group(ICON_FACE, dx=11.2, dy=-9, sx=1.4, sy=1.4)], 108, 108, 108, 108, 'App icon foreground: her face, close up. The background colour is her body.'))
write(f'{RES}/values/ic_lera_colors.xml', '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_lera_background">#6C63FF</color>\n</resources>\n')
for n in ('ic_launcher', 'ic_launcher_round'):
    write(f'{RES}/mipmap-anydpi-v26/{n}.xml', '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_lera_background"/>\n    <foreground android:drawable="@drawable/ic_lera_foreground"/>\n</adaptive-icon>\n')


def to_svg(parts_xml):
    """The few vector-drawable tags used here, as SVG."""
    import re
    def path(m):
        a = m.group(1)
        get = lambda k: (re.search(r'android:' + k + r'="([^"]*)"', a) or [None, None])[1]
        out = f'<path d="{get("pathData")}"'
        if get('fillColor'):
            c = get('fillColor'); out += f' fill="#{c[3:]}" fill-opacity="{int(c[1:3], 16) / 255 * float(get("fillAlpha") or 1):.3f}"'
        else:
            out += ' fill="none"'
        if get('strokeColor'):
            c = get('strokeColor'); out += f' stroke="#{c[3:]}" stroke-opacity="{int(c[1:3], 16) / 255:.3f}" stroke-width="{get("strokeWidth")}" stroke-linecap="round" stroke-linejoin="round"'
        return out + '/>'
    def grp(m):
        a = m.group(1)
        get = lambda k, d='0': (re.search(r'android:' + k + r'="([^"]*)"', a) or [None, d])[1]
        return f'<g transform="translate({get("translateX")} {get("translateY")}) translate({get("pivotX")} {get("pivotY")}) rotate({get("rotation")}) scale({get("scaleX", "1")} {get("scaleY", "1")}) translate({-float(get("pivotX"))} {-float(get("pivotY"))})">'
    s = re.sub(r'<path ([^>]*)/>', path, parts_xml)
    s = re.sub(r'<group ([^>]*)>', grp, s)
    return s.replace('</group>', '</g>')


write('public/icon.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><rect x="18" y="18" width="72" height="72" fill="#6C63FF"/>{to_svg(group(ICON_FACE, dx=11.2, dy=-9, sx=1.4, sy=1.4))}</svg>\n')

print(f'wrote {len(FACES)} faces, {len(BLENDS)} face-filled cards, {len(BG)} backgrounds, the icon')
