#!/usr/bin/env python3
"""확장 아이콘을 만든다.

    uv run --with pillow tools/make-icons.py

원본은 icons/source.png 다 — 흰 배경 위에 둥근 사각형 마크가 있는 그림.
여기서 마크의 경계와 모서리 반지름을 재서 잘라내고, 흰 모서리를 투명으로
바꾼 뒤 16·32·48·128·512 로 줄인다. 모서리를 그대로 두면 다크 툴바에서
흰 귀가 드러난다.

2026-09-24 이전에는 `>_` 모티프를 크기마다 직접 그렸다. 지금 원본은 그림이라
줄이는 수밖에 없다 — 16px 에서 얼굴이 읽히는지는 눈으로 확인한다.
"""
from PIL import Image, ImageDraw
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'icons'
SRC = OUT / 'source.png'
WHITE = 235          # 이 값 이상이면 배경(흰색)으로 본다
SS = 4               # 마스크는 4배로 그려서 줄인다


def is_bg(px):
    return px[0] >= WHITE and px[1] >= WHITE and px[2] >= WHITE


def find_mark(im):
    """마크의 경계 상자와 모서리 반지름을 잰다."""
    w, h = im.size
    px = im.load()
    xs, ys = [], []
    step = 2
    for y in range(0, h, step):
        for x in range(0, w, step):
            if not is_bg(px[x, y]):
                xs.append(x); ys.append(y)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    # 윗변에서 처음 마크가 나오는 x 까지의 거리가 반지름이다.
    y = y0 + 2
    xl = next(x for x in range(x0, x1) if not is_bg(px[x, y]))
    r = xl - x0
    return (x0, y0, x1 + 1, y1 + 1), r


def cut(im):
    box, r = find_mark(im)
    mark = im.crop(box).convert('RGBA')
    w, h = mark.size
    side = min(w, h)
    mark = mark.crop((0, 0, side, side))
    mask = Image.new('L', (side * SS, side * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, side * SS - 1, side * SS - 1], radius=int(r * SS * 0.97), fill=255)
    mark.putalpha(mask.resize((side, side), Image.LANCZOS))
    return mark, r / side


def main():
    src = Image.open(SRC).convert('RGB')
    mark, ratio = cut(src)
    print(f'  원본 {src.size[0]}px → 마크 {mark.size[0]}px, 모서리 반지름 {ratio:.2f}')
    for n in (16, 32, 48, 128, 512):
        mark.resize((n, n), Image.LANCZOS).save(OUT / f'icon{n}.png')
        print(f'  icons/icon{n}.png' + ('  (스토어 리스팅용)' if n == 512 else ''))


if __name__ == '__main__':
    main()
