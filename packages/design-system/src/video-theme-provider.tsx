import { createContext, type ReactNode, useContext } from "react";
import { videoTheme, type VideoTheme } from "./video-theme.js";

const VideoThemeContext = createContext<VideoTheme>(videoTheme);

export function VideoThemeProvider({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <VideoThemeContext.Provider value={videoTheme}>
      {children}
    </VideoThemeContext.Provider>
  );
}

export function useVideoTheme(): VideoTheme {
  return useContext(VideoThemeContext);
}
