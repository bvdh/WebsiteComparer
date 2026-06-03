import type { RefObject } from "react";
import type { PaneSide } from "../types/sync";

type ComparisonPaneProps = {
  side: PaneSide;
  title: string;
  src: string;
  iframeRef: RefObject<HTMLIFrameElement>;
};

export function ComparisonPane(props: ComparisonPaneProps) {
  return (
    <section className="pane">
      <div className="pane-header">
        <span>{props.title}</span>
      </div>
      <iframe
        ref={props.iframeRef}
        title={`${props.side} pane`}
        src={props.src}
        className="pane-frame"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      />
    </section>
  );
}
