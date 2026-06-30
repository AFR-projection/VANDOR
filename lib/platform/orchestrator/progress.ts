export type WorkflowProgressEvent =
  | {
      type: "plan";
      summary: string;
      steps: Array<{ stepKey: string; agentId: string }>;
    }
  | {
      type: "step-start";
      stepKey: string;
      agentId: string;
      attempt: number;
    }
  | {
      type: "step-complete";
      stepKey: string;
      agentId: string;
      summary?: string;
    }
  | {
      type: "step-failed";
      stepKey: string;
      agentId: string;
      error: string;
      willRetry: boolean;
    }
  | { type: "waiting-retry"; retryInMs: number }
  | { type: "status"; message: string };

export type WorkflowProgressHandler = (
  event: WorkflowProgressEvent
) => void;
