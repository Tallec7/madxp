import { Injectable } from '@angular/core';
import { OverlayElement, ImageElement, TextElement } from './template-renderer.service';

@Injectable({ providedIn: 'root' })
export class VideoCompositorService {

  drawFrame(
    ctx: CanvasRenderingContext2D,
    elements: OverlayElement[],
    imageCache: Map<string, HTMLImageElement>,
    time: number,
    _width: number,
    _height: number
  ): void {
    for (const el of elements) {
      const opacity = this.computeOpacity(el, time);
      if (opacity <= 0) continue;

      ctx.save();
      ctx.globalAlpha = opacity;

      if (el.kind === 'image') {
        this.drawImageElement(ctx, el, imageCache);
      } else {
        this.drawTextElement(ctx, el, time);
      }

      ctx.restore();
    }
  }

  async preloadImages(elements: OverlayElement[]): Promise<Map<string, HTMLImageElement>> {
    const cache = new Map<string, HTMLImageElement>();
    const imageElements = elements.filter((el): el is ImageElement => el.kind === 'image');

    await Promise.all(imageElements.map(el => {
      if (cache.has(el.src)) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => { cache.set(el.src, img); resolve(); };
        img.onerror = () => resolve();
        img.src = el.src;
      });
    }));

    return cache;
  }

  private drawImageElement(
    ctx: CanvasRenderingContext2D,
    el: ImageElement,
    imageCache: Map<string, HTMLImageElement>
  ): void {
    const img = imageCache.get(el.src);
    if (!img) return;

    if (el.shadow) {
      ctx.shadowBlur = el.shadow.blur;
      ctx.shadowColor = el.shadow.color;
    }

    if (el.borderRadius) {
      ctx.beginPath();
      ctx.arc(el.x + el.width / 2, el.y + el.height / 2, Math.min(el.width, el.height) / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }

    if (el.objectFit === 'cover') {
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const boxRatio = el.width / el.height;
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (imgRatio > boxRatio) {
        sw = img.naturalHeight * boxRatio;
        sx = (img.naturalWidth - sw) / 2;
      } else {
        sh = img.naturalWidth / boxRatio;
        sy = (img.naturalHeight - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, el.x, el.y, el.width, el.height);
    } else {
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const boxRatio = el.width / el.height;
      let dw = el.width, dh = el.height, dx = el.x, dy = el.y;
      if (imgRatio > boxRatio) {
        dh = el.width / imgRatio;
        dy = el.y + (el.height - dh) / 2;
      } else {
        dw = el.height * imgRatio;
        dx = el.x + (el.width - dw) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    if (el.border) {
      ctx.strokeStyle = el.border.color;
      ctx.lineWidth = el.border.width;
      if (el.borderRadius) {
        ctx.beginPath();
        ctx.arc(el.x + el.width / 2, el.y + el.height / 2, Math.min(el.width, el.height) / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(el.x, el.y, el.width, el.height);
      }
    }
  }

  private drawTextElement(ctx: CanvasRenderingContext2D, el: TextElement, time: number): void {
    const scale = this.computeScale(el, time);
    const yOffset = this.computeSlideOffset(el, time);

    ctx.textBaseline = 'middle';
    const fontFamily = el.fontFamily || "'Inter', 'Arial', sans-serif";
    ctx.font = `${el.fontWeight} ${el.fontSize}px ${fontFamily}`;
    ctx.fillStyle = el.color;

    if (el.shadow) {
      ctx.shadowBlur = el.shadow.blur;
      ctx.shadowColor = el.shadow.color;
    }

    const x = el.x;
    const y = el.y + yOffset;

    if (el.letterSpacing && el.letterSpacing > 0) {
      const chars = [...el.text];
      const widths = chars.map((c) => ctx.measureText(c).width);
      const totalWidth = widths.reduce((a, b) => a + b, 0) + el.letterSpacing * (chars.length - 1);
      let cursor = el.align === 'center' ? -totalWidth / 2 : el.align === 'right' ? -totalWidth : 0;

      ctx.textAlign = 'left';
      ctx.translate(x, y);
      if (scale !== 1) ctx.scale(scale, scale);
      for (let i = 0; i < chars.length; i++) {
        ctx.fillText(chars[i], cursor, 0);
        cursor += widths[i] + el.letterSpacing;
      }
    } else {
      ctx.textAlign = el.align;
      if (scale !== 1) {
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillText(el.text, 0, 0);
      } else {
        ctx.fillText(el.text, x, y);
      }
    }
  }

  private computeOpacity(el: OverlayElement, time: number): number {
    if (time < el.fadeIn[0]) return 0;
    if (time < el.fadeIn[1]) return (time - el.fadeIn[0]) / (el.fadeIn[1] - el.fadeIn[0]);
    if (time >= el.fadeOut[0]) {
      if (time >= el.fadeOut[1]) return 0;
      return 1 - (time - el.fadeOut[0]) / (el.fadeOut[1] - el.fadeOut[0]);
    }
    return 1;
  }

  private computeScale(el: OverlayElement, time: number): number {
    if (el.kind !== 'text' || !el.scaleAnim) return 1;
    const win = el.scaleWindow || el.fadeIn;
    if (time < win[0]) return el.scaleAnim[0];
    if (time >= win[1]) return el.scaleAnim[1];
    const t = (time - win[0]) / (win[1] - win[0]);
    const eased = 1 - Math.pow(1 - t, 3);
    return el.scaleAnim[0] + (el.scaleAnim[1] - el.scaleAnim[0]) * eased;
  }

  private computeSlideOffset(el: OverlayElement, time: number): number {
    if (el.kind !== 'text' || !el.slideFromY) return 0;
    if (time < el.fadeIn[0]) return el.slideFromY;
    if (time >= el.fadeIn[1]) return 0;
    const t = (time - el.fadeIn[0]) / (el.fadeIn[1] - el.fadeIn[0]);
    const eased = 1 - Math.pow(1 - t, 3);
    return el.slideFromY * (1 - eased);
  }
}
