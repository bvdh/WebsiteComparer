import type { BridgeIncomingMessage, PaneSide, ParentOutgoingMessage, ScrollAnchor } from "../types/sync";

export type SyncControllerOptions = {
  leftIframe: HTMLIFrameElement | null;
  rightIframe: HTMLIFrameElement | null;
  enabled: boolean;
  onNavigate: (from: PaneSide, absoluteUrl: string, messageType: "bridge:navigate" | "bridge:location") => void;
};

const LOCK_MS = 150;
const DEBUG_SYNC = true;

const debug = (message: string, details?: unknown): void => {
  if (!DEBUG_SYNC) {
    return;
  }

  // eslint-disable-next-line no-console
  console.debug(`[compare-parent] ${message}`, details ?? "");
};

export class SyncController {
  private lockUntil: Record<PaneSide, number> = { left: 0, right: 0 };

  public handleMessage(event: MessageEvent, options: SyncControllerOptions): void {
    const message = event.data as BridgeIncomingMessage | undefined;
    if (!message || message.source !== "compare-bridge") {
      return;
    }

    debug("received bridge message", message);

    const sideFromMessage: PaneSide | null =
      message.side === "left" || message.side === "right" ? message.side : null;
    const sideFromSource = this.resolveSideFromSource(event.source, options.leftIframe, options.rightIframe);
    const sourceSide = sideFromMessage ?? sideFromSource;

    if (!sourceSide) {
      debug("ignored message with unresolved side", {
        sideFromMessage,
        sideFromSource,
        message,
      });
      return;
    }

    if (sideFromMessage && sideFromSource && sideFromMessage !== sideFromSource) {
      debug("ignored message because side mismatch", {
        sideFromMessage,
        sideFromSource,
        message,
      });
      return;
    }

    if (message.type === "bridge:scroll") {
      if (!options.enabled) {
        debug("ignored scroll message because sync disabled", { sourceSide, messageType: message.type });
        return;
      }

      debug("routing scroll message", { sourceSide, ratio: message.ratio, anchor: message.anchor });
      this.syncScroll(sourceSide, message.ratio, message.anchor, options);
      return;
    }

    if ((message.type === "bridge:navigate" || message.type === "bridge:location") && message.url) {
      debug("routing navigation message", { sourceSide, url: message.url, type: message.type });
      options.onNavigate(sourceSide, message.url, message.type);
    }
  }

  private syncScroll(
    sourceSide: PaneSide,
    ratio: number | undefined,
    anchor: ScrollAnchor | undefined,
    options: Pick<SyncControllerOptions, "leftIframe" | "rightIframe" | "enabled">
  ): void {
    if (!Number.isFinite(ratio) && !anchor) {
      debug("ignored scroll sync due to missing sync target", { sourceSide, ratio, anchor });
      return;
    }

    const now = Date.now();
    if (this.lockUntil[sourceSide] > now) {
      debug("ignored scroll sync due to source lock", {
        sourceSide,
        lockUntil: this.lockUntil[sourceSide],
        now,
      });
      return;
    }

    const targetSide: PaneSide = sourceSide === "left" ? "right" : "left";
    const targetWindow = targetSide === "left" ? options.leftIframe?.contentWindow : options.rightIframe?.contentWindow;

    if (!targetWindow) {
      debug("failed to forward scroll because target window not ready", { sourceSide, targetSide });
      return;
    }

    this.lockUntil[targetSide] = now + LOCK_MS;

    const payload: ParentOutgoingMessage = {
      source: "compare-parent",
      targetSide,
      type: "parent:scroll",
      ratio,
      anchor,
    };
    debug("forwarding scroll command", payload);
    targetWindow.postMessage(payload, "*");
  }

  private resolveSideFromSource(
    source: MessageEventSource | null,
    leftIframe: HTMLIFrameElement | null,
    rightIframe: HTMLIFrameElement | null
  ): PaneSide | null {
    if (!source) {
      return null;
    }

    if (source === leftIframe?.contentWindow) {
      return "left";
    }

    if (source === rightIframe?.contentWindow) {
      return "right";
    }

    return null;
  }
}
