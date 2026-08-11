"use client";

import { VideoDesignPreviewPlayer } from "@avlp/design-system";

export default function VideoDesignPreviewPage() {
  return (
    <>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          overflow: hidden;
        }
      `}</style>
      <main
        data-testid="video-design-preview"
        style={{ height: "1080px", width: "1920px" }}
      >
        <VideoDesignPreviewPlayer controls={false} />
      </main>
    </>
  );
}
