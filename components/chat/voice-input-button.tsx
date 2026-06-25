"use client";

import { Loader2Icon, MicIcon, SquareIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { apiBasePath } from "@/lib/app-url";
const base = apiBasePath;

type VoiceInputButtonProps = {
  disabled?: boolean;
  onTranscript: (text: string) => void;
};

export function VoiceInputButton({
  disabled,
  onTranscript,
}: VoiceInputButtonProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopRecording = useCallback(() => {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({
        type: "error",
        description: "Mikrofon tidak didukung di browser ini",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4",
      });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size < 100) {
          toast({ type: "error", description: "Rekaman terlalu pendek" });
          return;
        }
        setProcessing(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "voice.webm");
          const res = await fetch(`${base()}/api/voice/transcribe`, {
            method: "POST",
            body: form,
          });
          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.error ?? "Transkripsi gagal");
          }
          onTranscript(json.text);
          toast({ type: "success", description: "Suara dikonversi ke teks" });
        } catch (e) {
          toast({
            type: "error",
            description: e instanceof Error ? e.message : "Transkripsi gagal",
          });
        } finally {
          setProcessing(false);
        }
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast({ type: "error", description: "Izin mikrofon ditolak" });
    }
  }, [onTranscript]);

  const toggle = () => {
    if (recording) stopRecording();
    else void startRecording();
  };

  return (
    <Button
      aria-label={recording ? "Stop rekaman" : "Rekam suara"}
      className={cn(
        "size-8 shrink-0 rounded-xl",
        recording && "bg-red-500/15 text-red-600 hover:bg-red-500/25"
      )}
      disabled={disabled || processing}
      onClick={toggle}
      size="icon"
      type="button"
      variant="ghost"
    >
      {processing ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : recording ? (
        <SquareIcon className="size-3.5 fill-current" />
      ) : (
        <MicIcon className="size-4" />
      )}
    </Button>
  );
}
