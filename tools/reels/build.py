#!/usr/bin/env python3
"""Assemble the product reels and publish them into the site.

  build.py kb                       frames + overlays        -> <work>/kleinbahn-reel.mp4
  build.py wz <path to wortzauber>  recordings + overlays    -> <work>/wortzauber-reel.mp4 (with the meadow music)
  build.py publish                  both reels               -> assets/projects/ (web video, poster, four stills each)

<work> is $REELS_WORK, or .reels/ in the site repo. The timeline of each reel is the `parts` list of kb() and wz().
"""
import glob, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
S = os.environ.get('REELS_WORK') or os.path.join(SITE, '.reels')

# Pictures for the product pages, taken from the sources so they carry no caption. First entry = the poster
# (also the card on the front page), then the four stills in page order.
# Kleinbahn: (shot, frame number). Wortzauber: (take, mark in marks.json, seconds after the mark).
KB_PICS = [('a-wide', 60), ('b-train', 60), ('c-town', 70), ('f-launch', 60), ('i-dusk', 119)]
WZ_PICS = [('meadow', 'apple', 1.0), ('meadow', 'traced', -3.0), ('quest', 'start', 2.5), ('castle', 'start', 2.0), ('map', 'start', 2.5)]
# The picture inside the landscape phone frame of the Wortzauber page, cropped to the phone's 874:402 shape.
WZ_PHONE = ('quest', 'start', 2.5)


def run(args):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y'] + args, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-1500:]); sys.exit(1)


def seg(out, fps, src, dur, overlays=(), speed=1.0, freeze=0.0, fade_in=False, fade_out=False):
    """One cut. src: ffmpeg input args of the base video. overlays: (png, t_in, t_out); t_out None = it stays."""
    total = dur + freeze
    args = list(src)
    for png, _, _ in overlays:
        args += ['-loop', '1', '-framerate', str(fps), '-t', f'{total:.3f}', '-i', png]
    chain = f'[0:v]setpts=(PTS-STARTPTS)/{speed},fps={fps},scale=1280:720:flags=lanczos,format=yuv420p'
    if freeze:
        chain += f',tpad=stop_mode=clone:stop_duration={freeze}'
    chain += f',trim=duration={total:.3f}'
    if fade_in:
        chain += ',fade=t=in:st=0:d=0.5'
    chain += '[b0]'
    last = 'b0'
    for i, (_, t_in, t_out) in enumerate(overlays, 1):
        f = f'[{i}:v]format=rgba,fade=t=in:st={t_in}:d=0.35:alpha=1'
        if t_out is not None:
            f += f',fade=t=out:st={t_out}:d=0.3:alpha=1'
        chain += f';{f}[o{i}];[{last}][o{i}]overlay=0:0:format=auto[b{i}]'
        last = f'b{i}'
    if fade_out:
        chain += f';[{last}]fade=t=out:st={total - 0.6:.3f}:d=0.6[bf]'
        last = 'bf'
    run(args + ['-filter_complex', chain, '-map', f'[{last}]', '-t', f'{total:.3f}', '-r', str(fps),
                '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-an', out])
    return out


def duration(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))


def concat(parts, out, audio=None):
    lst = out + '.txt'
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    tmp = out + '.v.mp4'
    run(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', tmp])
    d = duration(tmp)
    if audio:
        af = f'[1:a]atrim=0:{d:.3f},afade=t=in:st=0:d=0.6,afade=t=out:st={d - 2.0:.3f}:d=2.0,volume=0.8[a]'
        run(['-i', tmp, '-i', audio, '-filter_complex', af, '-map', '0:v', '-map', '[a]', '-c:v', 'copy',
             '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', out])
    else:
        run(['-i', tmp, '-c', 'copy', '-movflags', '+faststart', out])
    os.remove(tmp); os.remove(lst)
    print(out, f'{d:.1f}s', os.path.getsize(out) // 1024, 'KB')


def kb():
    fps, F, O, W = 24, S + '/kb/frames', S + '/ov/kb', S + '/kb/seg'
    os.makedirs(W, exist_ok=True)
    fr = lambda d: ['-framerate', str(fps), '-i', f'{F}/{d}/%04d.jpg']
    n = lambda d: len(glob.glob(f'{F}/{d}/*.jpg')) / fps
    cap = lambda name, d: [(f'{O}/{name}.png', 0.35, n(d) - 0.45)]
    parts = [
        seg(W + '/a.mp4', fps, fr('a-wide'), n('a-wide'), [(O + '/title.png', 0.3, n('a-wide') - 0.9)], fade_in=True),
        seg(W + '/b.mp4', fps, fr('b-train'), n('b-train'), cap('c-train', 'b-train')),
        seg(W + '/c.mp4', fps, fr('c-town'), n('c-town'), cap('c-town', 'c-town')),
        seg(W + '/d.mp4', fps, fr('d-air'), n('d-air'), cap('c-air', 'd-air')),
        seg(W + '/e.mp4', fps, fr('e-volcano'), n('e-volcano'), cap('c-volcano', 'e-volcano')),
        seg(W + '/f.mp4', fps, fr('f-launch'), n('f-launch'), cap('c-launch', 'f-launch')),
        seg(W + '/g.mp4', fps, fr('g-autumn'), n('g-autumn'), cap('c-autumn', 'g-autumn')),
        seg(W + '/h.mp4', fps, fr('h-winter'), n('h-winter'), cap('c-winter', 'h-winter')),
        seg(W + '/i.mp4', fps, fr('i-dusk'), n('i-dusk'),
            [(O + '/c-dusk.png', 0.35, n('i-dusk') - 0.6), (O + '/end.png', n('i-dusk') + 0.1, None)], freeze=3.6, fade_out=True),
    ]
    concat(parts, S + '/kleinbahn-reel.mp4')


def wz(repo):
    fps, V, O, W = 30, S + '/wz/rec', S + '/ov/wz', S + '/wz/seg'
    os.makedirs(W, exist_ok=True)
    M = json.load(open(V + '/marks.json'))
    vid = lambda t: glob.glob(f'{V}/v-{t}/*.webm')[0]

    def clip(name, take, a, b, overlays=(), speed=1.0, **kw):
        dur = (b - a) / speed
        ov = [(f'{O}/{o}.png', ti, dur - 0.4 if to == 'end' else to) for o, ti, to in overlays]
        return seg(f'{W}/{name}.mp4', fps, ['-ss', f'{a:.3f}', '-t', f'{b - a:.3f}', '-i', vid(take)], dur, ov, speed=speed, **kw)

    m = M['meadow']
    span = lambda t, cut=0.0: (M[t]['start'], M[t]['end'] - cut)
    parts = [
        clip('00-title', 'meadow', m['start'] - 2.2, m['start'] - 0.1, [('title', 0.0, None)], fade_in=True),
        clip('01-type', 'meadow', m['start'] - 0.1, m['typed'] + 0.5, [('c-type', 1.9, 'end')]),
        # the tracing is slow to watch: run it at a multiple of real time
        clip('02-trace', 'meadow', m['trace'] - 0.3, m['traced'] + 0.3, [('c-trace', 0.3, 'end')], speed=(m['traced'] - m['trace'] + 0.6) / 5.5),
        clip('03-apple', 'meadow', m['closed'] - 0.2, m['picked'] - 1.0, [('c-apple', 0.4, 'end')]),
        clip('04-quest', 'quest', *span('quest'), [('c-quest', 0.3, 'end')]),
        clip('05-wall', 'wall', *span('wall', 0.6), [('c-wall', 0.3, 'end')]),
        clip('06-castle', 'castle', *span('castle', 0.6), [('c-castle', 0.3, 'end')]),
        clip('07-math', 'math-riddle', *span('math-riddle'), [('c-math', 0.3, 'end')]),
        clip('08-free', 'free-writing', *span('free-writing'), [('c-free', 0.3, 'end')]),
        clip('09-map', 'map', *span('map'), [('c-map', 0.3, 2.6), ('end', 3.0, None)], freeze=3.4, fade_out=True),
    ]
    concat(parts, S + '/wortzauber-reel.mp4', audio=os.path.join(repo, 'audio', 'music', 'meadow.mp3'))


def publish():
    out = os.path.join(SITE, 'assets', 'projects')
    os.makedirs(out, exist_ok=True)
    for name in ('kleinbahn', 'wortzauber'):
        src = f'{S}/{name}-reel.mp4'
        if not os.path.exists(src):
            print('missing', src); continue
        audio = ['-c:a', 'aac', '-b:a', '112k'] if name == 'wortzauber' else ['-an']
        run(['-i', src, '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-maxrate', '1800k', '-bufsize', '3600k',
             '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] + audio + [f'{out}/{name}-reel.mp4'])
        print(name, 'published', os.path.getsize(f'{out}/{name}-reel.mp4') // 1024, 'KB')
    tags = ['poster', '1', '2', '3', '4']
    for tag, (shot, frame) in zip(tags, KB_PICS):
        run(['-i', f'{S}/kb/frames/{shot}/{frame:04d}.jpg', '-q:v', '3', f'{out}/kleinbahn-{tag}.jpg'])
    marks = json.load(open(f'{S}/wz/rec/marks.json'))
    grab = lambda take, mark, off: ['-ss', f'{marks[take][mark] + off:.3f}', '-i', glob.glob(f'{S}/wz/rec/v-{take}/*.webm')[0], '-frames:v', '1', '-q:v', '3']
    for tag, pic in zip(tags, WZ_PICS):
        run(grab(*pic) + [f'{out}/wortzauber-{tag}.jpg'])
    run(grab(*WZ_PHONE) + ['-vf', 'crop=1280:589:0:66,scale=1748:804:flags=neighbor', f'{out}/wortzauber-phone.jpg'])


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'kb': kb()
    elif cmd == 'wz': wz(os.path.abspath(sys.argv[2]))
    elif cmd == 'publish': publish()
    else: print(__doc__)
