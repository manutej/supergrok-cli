import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { formatTokenCount } from "../../utils/token-counter.js";

interface LoadingSpinnerProps {
  isActive: boolean;
  processingTime: number;
  tokenCount: number;
  isStreaming?: boolean;  // Add flag to know if content is actually flowing
}

const loadingTexts = [
  "Thinking...",
  "Computing...",
  "Analyzing...",
  "Processing...",
  "Calculating...",
  "Interfacing...",
  "Optimizing...",
  "Synthesizing...",
  "Decrypting...",
  "Calibrating...",
  "Bootstrapping...",
  "Synchronizing...",
  "Compiling...",
  "Downloading...",
];

export function LoadingSpinner({
  isActive,
  processingTime,
  tokenCount,
  isStreaming = false,
}: LoadingSpinnerProps) {
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);

  // Only animate spinner when actually streaming content
  useEffect(() => {
    if (!isActive || !isStreaming) return;

    const spinnerFrames = ["/", "-", "\\", "|"];
    // Reduced frequency: 500ms instead of 250ms to reduce flickering on Windows
    const interval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % spinnerFrames.length);
    }, 500);

    return () => clearInterval(interval);
  }, [isActive, isStreaming]);

  // Only change text when streaming content
  useEffect(() => {
    if (!isActive || !isStreaming) return;

    setLoadingTextIndex(Math.floor(Math.random() * loadingTexts.length));

    // Increased interval: 4s instead of 2s to reduce state changes
    const interval = setInterval(() => {
      setLoadingTextIndex(Math.floor(Math.random() * loadingTexts.length));
    }, 4000);

    return () => clearInterval(interval);
  }, [isActive, isStreaming]);

  if (!isActive) return null;

  const spinnerFrames = ["/", "-", "\\", "|"];

  return (
    <Box marginTop={1}>
      {isStreaming ? (
        // Animated spinner only when content is streaming
        <Text color="cyan">
          {spinnerFrames[spinnerFrame]} {loadingTexts[loadingTextIndex]}{" "}
        </Text>
      ) : (
        // Static indicator during thinking phase
        <Text color="cyan">⏳ Thinking... </Text>
      )}
      <Text color="gray">
        ({processingTime}s · ↑ {formatTokenCount(tokenCount)} tokens · esc to
        interrupt)
      </Text>
    </Box>
  );
}
