"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import type { WebSearchSource } from "@/lib/search/types";

export type SourcePanelState = {
  url: string;
  title: string;
  isVisible: boolean;
  snippet?: string;
  relatedSources?: WebSearchSource[];
};

export const initialSourcePanelState: SourcePanelState = {
  url: "",
  title: "",
  isVisible: false,
};

type Selector<T> = (state: SourcePanelState) => T;

export function useSourcePanelSelector<Selected>(selector: Selector<Selected>) {
  const { data } = useSWR<SourcePanelState>("source-panel", null, {
    fallbackData: initialSourcePanelState,
  });

  return useMemo(() => {
    return selector(data ?? initialSourcePanelState);
  }, [data, selector]);
}

export function useSourcePanel() {
  const { data, mutate } = useSWR<SourcePanelState>("source-panel", null, {
    fallbackData: initialSourcePanelState,
  });

  const state = data ?? initialSourcePanelState;

  const openSource = useCallback(
    (source: {
      url: string;
      title: string;
      snippet?: string;
      relatedSources?: WebSearchSource[];
    }) => {
      mutate({
        url: source.url,
        title: source.title,
        snippet: source.snippet,
        relatedSources: source.relatedSources,
        isVisible: true,
      });
    },
    [mutate]
  );

  const closeSourcePanel = useCallback(() => {
    mutate(initialSourcePanelState);
  }, [mutate]);

  return useMemo(
    () => ({
      sourcePanel: state,
      openSource,
      closeSourcePanel,
    }),
    [state, openSource, closeSourcePanel]
  );
}
