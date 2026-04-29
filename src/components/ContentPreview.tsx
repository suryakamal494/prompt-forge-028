import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import type { ContentType } from "@/lib/curriculum";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  storagePath: string;
  contentType: ContentType;
  title: string;
}

export function ContentPreview({ open, onOpenChange, storagePath, contentType, title }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setUrl(null);
    setFlashcards(null);
    (async () => {
      const { data } = await supabase.storage.from("content-library").createSignedUrl(storagePath, 3600);
      const signed = data?.signedUrl ?? null;
      setUrl(signed);
      if (contentType === "flashcards_json" && signed) {
        try {
          const res = await fetch(signed);
          const json = await res.json();
          setFlashcards(Array.isArray(json) ? json : json.cards ?? []);
        } catch {
          setFlashcards([]);
        }
      }
      setLoading(false);
    })();
  }, [open, storagePath, contentType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif truncate">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          {loading || !url ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : contentType === "pptx" ? (
            <iframe
              title={title}
              className="w-full h-full rounded-md border"
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
            />
          ) : contentType === "pdf" ? (
            <iframe title={title} className="w-full h-full rounded-md border" src={url} />
          ) : contentType === "image" ? (
            <div className="h-full overflow-auto flex items-center justify-center bg-muted rounded-md">
              <img src={url} alt={title} className="max-w-full max-h-full" />
            </div>
          ) : contentType === "flashcards_json" ? (
            <FlashcardsViewer cards={flashcards ?? []} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Preview not available for this file type.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FlashcardsViewer({ cards }: { cards: any[] }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (cards.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No cards.</div>;
  }
  const card = cards[i] ?? {};
  const front = card.front ?? card.question ?? card.q ?? JSON.stringify(card);
  const back = card.back ?? card.answer ?? card.a ?? "";
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <div
        className="w-full max-w-xl h-64 rounded-lg border bg-card shadow-elegant flex items-center justify-center text-center p-8 cursor-pointer"
        onClick={() => setFlipped((f) => !f)}
      >
        <div className="text-lg">{flipped ? back : front}</div>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <button
          className="px-3 py-1 rounded border"
          onClick={() => {
            setFlipped(false);
            setI((p) => Math.max(0, p - 1));
          }}
        >
          Prev
        </button>
        <span className="text-muted-foreground">
          {i + 1} / {cards.length}
        </span>
        <button
          className="px-3 py-1 rounded border"
          onClick={() => {
            setFlipped(false);
            setI((p) => Math.min(cards.length - 1, p + 1));
          }}
        >
          Next
        </button>
        <button className="px-3 py-1 rounded border" onClick={() => setFlipped((f) => !f)}>
          Flip
        </button>
      </div>
    </div>
  );
}
