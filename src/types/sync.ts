export type PaneSide = "left" | "right";

export type ScrollAnchor = {
  text: string;
  level: number;
  occurrence: number;
  offset: number;
};

export type BridgeIncomingMessage = {
  source: "compare-bridge";
  side: PaneSide | "unknown";
  type: "bridge:ready" | "bridge:location" | "bridge:navigate" | "bridge:scroll";
  url?: string;
  ratio?: number;
  anchor?: ScrollAnchor;
};

export type ParentOutgoingMessage = {
  source: "compare-parent";
  targetSide: PaneSide;
  type: "parent:scroll" | "parent:navigate" | "parent:history";
  ratio?: number;
  anchor?: ScrollAnchor;
  url?: string;
  direction?: "back" | "forward";
};
