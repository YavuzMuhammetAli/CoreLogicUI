import { ChangeDetectionStrategy, Component, ElementRef, input, OnDestroy, signal, viewChild } from '@angular/core';

/**
 * HelpHintComponent — the small "i" bubble next to form field labels.
 * Opens a short tooltip on hover or keyboard focus; no off-the-shelf tooltip library
 * is used (see the same visual language in model-detail).
 *
 * Where a longer explanation is needed, the `<app-datatype-help>` guide dialog
 * is used instead — this component is only for one-sentence hints.
 *
 * Usage:
 *   <label>MinLength <app-help-hint [text]="'help.rule.minLength' | t" /></label>
 *   <app-help-hint variant="formula" glyph="ƒx" [text]="rule.expression" [label]="…" />
 *     → auto-value formula; used instead of title so it is readable on touch devices too.
 *
 * POSITIONING: the tooltip is `position: fixed` and its coordinates are computed here. The reason is
 * that the containers the bubble sits in clip it:
 *   - `.panel { overflow: hidden }` (global)
 *   - `.dialog-panel { overflow-y: auto }` — per CSS, once `overflow-y` takes a value other than
 *     `visible`, `overflow-x` turns to `auto` too, i.e. it clips HORIZONTALLY as well.
 * `z-index` doesn't solve this (clipping is independent of paint order). `position: fixed` escapes
 * clipping ancestors because they don't form a containing block. In this project the containing block
 * is formed by the `.dialog-overlay`s (they carry `backdrop-filter`); all are `position: fixed;
 * inset: 0` and borderless, so their padding boxes equal the viewport and
 * `getBoundingClientRect()` coordinates can be used directly.
 */
@Component({
  selector: 'app-help-hint',
  templateUrl: './help-hint.component.html',
  styleUrls: ['./help-hint.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelpHintComponent implements OnDestroy {
  /** Tooltip text — the caller passes already-translated text. */
  text = input.required<string>();

  /**
   * PREFERRED opening direction. If there's no room it flips to the other side automatically, so
   * callers inside a dialog no longer have to write `below` (nothing breaks if they do).
   */
  placement = input<'above' | 'below'>('above');

  /** Glyph shown in the bubble ("i", or "ƒx" for auto-value). */
  glyph = input('i');

  /** `formula`: auto-value marker (ƒx) look — shows the formula in record forms. */
  variant = input<'info' | 'formula'>('info');

  /** Screen reader label; if omitted the tooltip text is read. */
  label = input<string | null>(null);

  private readonly bubble = viewChild.required<ElementRef<HTMLElement>>('bubble');
  private readonly tip = viewChild.required<ElementRef<HTMLElement>>('tip');

  readonly open = signal(false);
  readonly top = signal(0);
  readonly left = signal(0);
  /** Actual direction — determines which way the entry animation slides. */
  readonly resolved = signal<'above' | 'below'>('above');

  /** Gap between bubble and tooltip, and the viewport edge margin. */
  private readonly GAP = 8;
  private readonly MARGIN = 8;

  /** Moment the balloon went from closed to open — distinguishes events of the same tap on touch devices. */
  private shownAt = 0;

  show(): void {
    if (!this.open()) this.shownAt = performance.now();
    const anchor = this.bubble().nativeElement.getBoundingClientRect();
    // The tooltip is measurable via `visibility: hidden` (NOT display:none).
    const tip = this.tip().nativeElement.getBoundingClientRect();

    // Vertical: if there's no room in the preferred direction, flip to the other.
    const fitsAbove = anchor.top - tip.height - this.GAP >= this.MARGIN;
    const fitsBelow = anchor.bottom + tip.height + this.GAP <= window.innerHeight - this.MARGIN;
    const below = this.placement() === 'below' ? (fitsBelow || !fitsAbove) : (!fitsAbove && fitsBelow);

    this.resolved.set(below ? 'below' : 'above');
    this.top.set(below ? anchor.bottom + this.GAP : anchor.top - tip.height - this.GAP);

    // Horizontal: centre on the bubble, then clamp to the viewport — this is the computation that
    // keeps the balloon's left/right side from being cut off for fields in edge columns.
    const centered = anchor.left + anchor.width / 2 - tip.width / 2;
    const maxLeft = Math.max(this.MARGIN, window.innerWidth - tip.width - this.MARGIN);
    this.left.set(Math.min(Math.max(centered, this.MARGIN), maxLeft));

    this.open.set(true);
    this.bindViewportListeners();
  }

  hide(): void {
    this.open.set(false);
    this.unbindViewportListeners();
  }

  /**
   * No hover on touch: a tap first opens the balloon via (emulated) mouseenter/focus,
   * and the click follows right after — that click must not close it. A second tap closes it.
   * On mouse devices hover already handles it, so nothing is done.
   */
  onTap(): void {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    if (!this.open()) this.show();
    else if (performance.now() - this.shownAt > 400) this.hide();
  }

  ngOnDestroy(): void {
    this.unbindViewportListeners();
  }

  // ─── Preventing a stale position ───────────────────────────────────────────
  // The position is computed when opening; scrolling/resizing makes it stale.
  // Hiding is enough instead of recomputing — the balloon only lives as long as the hover anyway.

  private readonly onViewportChange = () => {
    // On touch, focusing the bubble closes the open keyboard (resize) and may scroll
    // the page — these events right after opening must not close the balloon.
    if (performance.now() - this.shownAt < 500) return;
    this.hide();
  };

  /**
   * The `scroll` event DOES NOT BUBBLE: the dialog panel's own scrolling never reaches `document`.
   * So the listener is attached in the CAPTURE phase (`@HostListener` can't do capture) and
   * stays attached only while the balloon is open.
   */
  private bindViewportListeners(): void {
    document.addEventListener('scroll', this.onViewportChange, true);
    window.addEventListener('resize', this.onViewportChange);
  }

  private unbindViewportListeners(): void {
    document.removeEventListener('scroll', this.onViewportChange, true);
    window.removeEventListener('resize', this.onViewportChange);
  }
}
