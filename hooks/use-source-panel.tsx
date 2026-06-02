"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";

export type SourcePanelState = {
  url: string;
  title: string;
  isVisible: boolean;
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
    (source: { url: string; title: string }) => {
      mutate({
        url: source.url,
        title: source.title,
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
